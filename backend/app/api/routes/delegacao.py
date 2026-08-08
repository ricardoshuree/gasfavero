# [mcp-local harness] feature: fix-n1-demandas-e-cores-card | plano: 46879d5c | 2026-08-08 15:26:46
# Corrige N+1: nova _to_demandas_public_batch faz batch-load de todas as relacoes em vez de N round-trips por chamado; usada nas rotas de listagem
# [mcp-local harness] feature: fase2-rotas-cancelar-reatribuir-disponibilidade | plano: c5f719de | 2026-08-08 11:06:09
# Endpoints novos: cancelar (qualquer estado ativo), reatribuir (so pendente), disponibilidade (GET lista + PUT toggle). Recusar legado ganha protecao reforcada (action=delete)
"""
Rotas de Chamado (nome de exibição; endpoints/paths continuam
"demandas-venda" internamente -- mesmo padrão de divergência
técnico/negócio de Item/Produto). Controle de acesso via módulo RBAC
"delegacao" (já existente desde a migration b7c8d9e0f1a2).

Ciclo de vida de um Chamado -- ver comentário completo em
models.py (classe DemandaVenda) pra contexto da decisão de negócio.
Resumo:
  pendente  -> aceita     (motorista aceita; se estava aberto -- sem
                           motorista_id -- quem aceita assume o
                           chamado, ver aceitar_demanda_venda)
  pendente  -> cancelada  (SÓ o atendente, ver cancelar_demanda_venda
                           -- funciona de pendente OU aceita)
  aceita    -> cancelada  (idem)
  aceita    -> concluida  (motorista marca "cheguei ao destino" --
                           ENCERRA o chamado: some do mapa e da lista
                           do motorista. A venda em si acontece
                           depois, separadamente, na tela de Vendas)

endereco_id em DemandaVendaCreate é sempre um Endereco JÁ EXISTENTE
(nunca texto livre) -- decisão confirmada, porque sem endereço
estruturado não dá pra plotar no mapa. Normalmente é o endereço
vigente do próprio cliente (ver clientes.py / ClienteEndereco), mas o
endpoint aceita qualquer endereco_id válido para não travar o caso de
entrega num endereço diferente do cadastrado.

PROTEÇÃO DE PERMISSÃO -- ação "Apagar" reaproveitada como "gestão do
atendente": cancelar, reatribuir e recusar (legado) exigem a ação
"delete" do módulo "delegacao". O Motorista tem hoje só Ver+Editar
nesse módulo (sem Apagar) -- então essas 3 rotas ficam automaticamente
fechadas pra ele, sem precisar de um módulo RBAC novo. Gerente/Admin/
Operador têm CRUD completo em delegacao, então continuam liberados.
"""
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, select

from app.api.deps import CurrentUser, SessionDep, require_module_permission
from app.models import (
    Bairro,
    Cidade,
    Cliente,
    DemandaVenda,
    DemandaVendaAceitarRequest,
    DemandaVendaCreate,
    DemandaVendaItem,
    DemandaVendaItemPublic,
    DemandaVendaPublic,
    DemandaVendaReatribuirRequest,
    DemandasVendaPublic,
    Endereco,
    EnderecoPublic,
    Item,
    MotoristaDisponibilidadePublic,
    MotoristaDisponibilidadeUpdate,
    MotoristaLocalizacao,
    MotoristaLocalizacaoPublic,
    MotoristaLocalizacaoUpdate,
    MotoristasDisponibilidadePublic,
    MotoristasLocalizacaoPublic,
    Role,
    Rua,
    User,
    UserRole,
    get_datetime_utc,
)

router = APIRouter(tags=["delegacao"])

MODULE = "delegacao"

# "recusada" continua um valor válido de LEITURA (registros antigos
# no banco podem tê-lo), mas nenhum fluxo novo o produz -- ver
# comentário de ciclo de vida em models.py.
STATUS_VALIDOS = ("pendente", "aceita", "recusada", "cancelada", "concluida")

# Nome exato da role RBAC "Motorista" -- usado só pra listar quem
# aparece em GET /motoristas/disponibilidade. Mesmo cuidado do
# frontend (chamado.tsx): se a role for renomeada, este filtro para
# de bater (sem acoplamento por id fixo).
ROLE_MOTORISTA = "Motorista"

# Fuso de Veranópolis/RS -- usado só pra decidir os limites de "hoje"
# no painel de Chamadas hoje (ver read_demandas_hoje). created_at
# continua gravado em UTC no banco como sempre; aqui só convertemos
# os LIMITES do dia local pra UTC na hora de montar a query.
FUSO_BRASIL = ZoneInfo("America/Sao_Paulo")

# Estados a partir dos quais um chamado pode ser cancelado -- "de
# qualquer estado ativo" (decisão do Ricardo), ou seja, tudo que
# ainda não é terminal. "concluida" e "cancelada" já são terminais,
# recancelar não faz sentido (sobrescreveria finalizada_em de um
# chamado que já tinha sido encerrado de verdade).
ESTADOS_CANCELAVEIS = ("pendente", "aceita")


# ---------------------------------------------------------------------------
# Helpers internos
# ---------------------------------------------------------------------------

def _motorista_nome(motorista: User | None) -> str | None:
    if not motorista:
        return None
    return motorista.full_name or motorista.email


def _limites_hoje_utc() -> tuple[datetime, datetime]:
    """(início, fim) do dia corrente no horário de Brasília,
    convertidos pra UTC -- usado pra filtrar created_at (que fica
    gravado em UTC) sem depender de conversão manual no frontend."""
    agora_local = datetime.now(FUSO_BRASIL)
    inicio_local = agora_local.replace(hour=0, minute=0, second=0, microsecond=0)
    fim_local = inicio_local + timedelta(days=1)
    return inicio_local.astimezone(UTC), fim_local.astimezone(UTC)


def _to_endereco_public(session: SessionDep, endereco: Endereco) -> EnderecoPublic:
    rua = session.get(Rua, endereco.rua_id)
    bairro = session.get(Bairro, rua.bairro_id) if rua else None
    cidade = session.get(Cidade, bairro.cidade_id) if bairro else None
    return EnderecoPublic(
        id=endereco.id,
        numero=endereco.numero,
        complemento=endereco.complemento,
        rua_nome=rua.nome if rua else "",
        bairro_nome=bairro.nome if bairro else "",
        cidade_nome=cidade.nome if cidade else "",
        latitude=endereco.latitude,
        longitude=endereco.longitude,
    )


def _to_demanda_public(session: SessionDep, demanda: DemandaVenda) -> DemandaVendaPublic:
    """Versão de UM chamado só -- usada pelas rotas de AÇÃO (criar,
    aceitar, cancelar, reatribuir, concluir), que sempre operam em
    um único registro por requisição. Continua fazendo um round-trip
    por relação (aceitável aqui, é 1x só). Para LISTAGENS, ver
    _to_demandas_public_batch abaixo -- nunca chame esta função dentro
    de um loop."""
    cliente = session.get(Cliente, demanda.cliente_id)
    endereco = session.get(Endereco, demanda.endereco_id)
    motorista = (
        session.get(User, demanda.motorista_id) if demanda.motorista_id else None
    )

    itens_db = session.exec(
        select(DemandaVendaItem).where(DemandaVendaItem.demanda_id == demanda.id)
    ).all()
    itens = []
    for item_row in itens_db:
        produto = session.get(Item, item_row.produto_id)
        itens.append(
            DemandaVendaItemPublic(
                id=item_row.id,
                produto_id=item_row.produto_id,
                produto_title=produto.title if produto else "(produto removido)",
                quantidade=item_row.quantidade,
            )
        )

    return DemandaVendaPublic(
        id=demanda.id,
        cliente_id=demanda.cliente_id,
        cliente_nome=cliente.nome if cliente else "(cliente removido)",
        endereco=_to_endereco_public(session, endereco),
        motorista_id=demanda.motorista_id,
        motorista_nome=_motorista_nome(motorista),
        observacao=demanda.observacao,
        status=demanda.status,
        criado_por_id=demanda.criado_por_id,
        created_at=demanda.created_at,
        respondida_em=demanda.respondida_em,
        finalizada_em=demanda.finalizada_em,
        itens=itens,
    )


def _to_demandas_public_batch(
    session: SessionDep, demandas: list[DemandaVenda]
) -> list[DemandaVendaPublic]:
    """Versão em LOTE de _to_demanda_public -- usada pelas rotas de
    LISTAGEM (read_demandas_venda, read_demandas_hoje).

    BUG CORRIGIDO (sessão 08/08, encontrado ao testar a reestruturação
    do /chamados-ativos): a versão anterior chamava _to_demanda_public
    dentro de um loop `for d in demandas`, e cada chamada fazia até 7
    round-trips sequenciais ao Postgres (cliente, endereço, rua,
    bairro, cidade, motorista, itens) -- um N+1 clássico. Com o
    histórico de chamados de teste acumulado ao longo de várias
    sessões (pendente/aceita/cancelada/concluída/recusada, tudo
    incluído numa listagem sem filtro), isso já passava de 10s pra
    meia dúzia de registros e travava por completo (>40s) com o
    histórico inteiro -- foi isso que quebrou a tela /chamados-ativos
    logo depois de reestruturada.

    Aqui, em vez de N×7 round-trips, são no máximo 7 queries em LOTE
    (uma por tipo de entidade, com WHERE id IN (...)) INDEPENDENTE da
    quantidade de chamados -- O(1) round-trips em vez de O(n)."""
    if not demandas:
        return []

    cliente_ids = {d.cliente_id for d in demandas}
    endereco_ids = {d.endereco_id for d in demandas}
    motorista_ids = {d.motorista_id for d in demandas if d.motorista_id}
    demanda_ids = [d.id for d in demandas]

    clientes = {
        c.id: c
        for c in session.exec(
            select(Cliente).where(col(Cliente.id).in_(cliente_ids))
        ).all()
    }
    enderecos = {
        e.id: e
        for e in session.exec(
            select(Endereco).where(col(Endereco.id).in_(endereco_ids))
        ).all()
    }

    rua_ids = {e.rua_id for e in enderecos.values()}
    ruas = (
        {
            r.id: r
            for r in session.exec(select(Rua).where(col(Rua.id).in_(rua_ids))).all()
        }
        if rua_ids
        else {}
    )
    bairro_ids = {r.bairro_id for r in ruas.values()}
    bairros = (
        {
            b.id: b
            for b in session.exec(
                select(Bairro).where(col(Bairro.id).in_(bairro_ids))
            ).all()
        }
        if bairro_ids
        else {}
    )
    cidade_ids = {b.cidade_id for b in bairros.values()}
    cidades = (
        {
            c.id: c
            for c in session.exec(
                select(Cidade).where(col(Cidade.id).in_(cidade_ids))
            ).all()
        }
        if cidade_ids
        else {}
    )
    motoristas = (
        {
            m.id: m
            for m in session.exec(
                select(User).where(col(User.id).in_(motorista_ids))
            ).all()
        }
        if motorista_ids
        else {}
    )

    itens_por_demanda: dict[uuid.UUID, list[DemandaVendaItem]] = {}
    for item_row in session.exec(
        select(DemandaVendaItem).where(
            col(DemandaVendaItem.demanda_id).in_(demanda_ids)
        )
    ).all():
        itens_por_demanda.setdefault(item_row.demanda_id, []).append(item_row)

    produto_ids = {i.produto_id for lista in itens_por_demanda.values() for i in lista}
    produtos = (
        {
            p.id: p
            for p in session.exec(select(Item).where(col(Item.id).in_(produto_ids))).all()
        }
        if produto_ids
        else {}
    )

    def endereco_public(endereco: Endereco) -> EnderecoPublic:
        rua = ruas.get(endereco.rua_id)
        bairro = bairros.get(rua.bairro_id) if rua else None
        cidade = cidades.get(bairro.cidade_id) if bairro else None
        return EnderecoPublic(
            id=endereco.id,
            numero=endereco.numero,
            complemento=endereco.complemento,
            rua_nome=rua.nome if rua else "",
            bairro_nome=bairro.nome if bairro else "",
            cidade_nome=cidade.nome if cidade else "",
            latitude=endereco.latitude,
            longitude=endereco.longitude,
        )

    resultado: list[DemandaVendaPublic] = []
    for d in demandas:
        cliente = clientes.get(d.cliente_id)
        endereco = enderecos.get(d.endereco_id)
        motorista = motoristas.get(d.motorista_id) if d.motorista_id else None
        itens = [
            DemandaVendaItemPublic(
                id=item_row.id,
                produto_id=item_row.produto_id,
                produto_title=(
                    produtos[item_row.produto_id].title
                    if item_row.produto_id in produtos
                    else "(produto removido)"
                ),
                quantidade=item_row.quantidade,
            )
            for item_row in itens_por_demanda.get(d.id, [])
        ]
        resultado.append(
            DemandaVendaPublic(
                id=d.id,
                cliente_id=d.cliente_id,
                cliente_nome=cliente.nome if cliente else "(cliente removido)",
                endereco=endereco_public(endereco),
                motorista_id=d.motorista_id,
                motorista_nome=_motorista_nome(motorista),
                observacao=d.observacao,
                status=d.status,
                criado_por_id=d.criado_por_id,
                created_at=d.created_at,
                respondida_em=d.respondida_em,
                finalizada_em=d.finalizada_em,
                itens=itens,
            )
        )
    return resultado


def _to_localizacao_public(
    session: SessionDep, loc: MotoristaLocalizacao
) -> MotoristaLocalizacaoPublic:
    motorista = session.get(User, loc.motorista_id)
    return MotoristaLocalizacaoPublic(
        motorista_id=loc.motorista_id,
        motorista_nome=_motorista_nome(motorista) or "(usuário removido)",
        latitude=loc.latitude,
        longitude=loc.longitude,
        atualizado_em=loc.atualizado_em,
    )


# ---------------------------------------------------------------------------
# Rotas — Chamado
# ---------------------------------------------------------------------------

@router.get(
    "/demandas-venda/",
    response_model=DemandasVendaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_demandas_venda(
    session: SessionDep,
    motorista_id: uuid.UUID | None = None,
    status: Literal["pendente", "aceita", "recusada", "cancelada", "concluida"]
    | None = None,
) -> Any:
    """Lista chamados, mais recentes primeiro. Filtros opcionais por
    motorista (fila "Minhas Demandas" do motorista) e/ou status. Não
    filtra por padrão os chamados abertos (motorista_id NULL) -- pra
    ver só os abertos, o frontend usa motorista_id=null implicitamente
    (não manda o parâmetro) e filtra client-side, ou pode-se adicionar
    um filtro dedicado depois se a lista crescer demais."""
    statement = select(DemandaVenda)
    if motorista_id is not None:
        statement = statement.where(DemandaVenda.motorista_id == motorista_id)
    if status is not None:
        statement = statement.where(DemandaVenda.status == status)

    demandas = session.exec(
        statement.order_by(col(DemandaVenda.created_at).desc())
    ).all()
    return DemandasVendaPublic(data=_to_demandas_public_batch(session, list(demandas)))


@router.get(
    "/demandas-venda/hoje",
    response_model=DemandasVendaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_demandas_hoje(session: SessionDep) -> Any:
    """Chamados criados HOJE (horário de Brasília) -- usado no painel
    lateral da tela Mapa ("Chamadas hoje"). Não filtra por status: o
    frontend separa em "ativas" (pendente/aceita) no topo e
    "concluídas" (finalizada_em preenchido) embaixo -- chamados
    cancelados/recusados hoje simplesmente não aparecem em nenhum dos
    dois grupos, exceto que agora "cancelada" TAMBÉM preenche
    finalizada_em (ver comentário em models.py), então cai junto dos
    concluídos nesse filtro simples -- se precisar diferenciar
    visualmente cancelado de concluído de verdade aqui, o frontend
    precisa olhar o campo `status`, não só a presença de
    finalizada_em.

    Isso é um filtro de DATA, não uma exclusão -- reseta sozinho à
    meia-noite porque o dia mudou, o histórico continua intacto no
    banco pra sempre, só não aparece mais aqui no dia seguinte."""
    inicio_utc, fim_utc = _limites_hoje_utc()
    demandas = session.exec(
        select(DemandaVenda)
        .where(DemandaVenda.created_at >= inicio_utc)
        .where(DemandaVenda.created_at < fim_utc)
        .order_by(col(DemandaVenda.created_at).desc())
    ).all()
    return DemandasVendaPublic(data=_to_demandas_public_batch(session, list(demandas)))


@router.post(
    "/demandas-venda/",
    response_model=DemandaVendaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="create"))],
)
def create_demanda_venda(
    *, session: SessionDep, current_user: CurrentUser, demanda_in: DemandaVendaCreate
) -> Any:
    """Despacha um chamado. Sempre nasce com status 'pendente'.
    criado_por_id é sempre o usuário autenticado que fez a chamada (o
    atendente), NUNCA o motorista. motorista_id omitido = chamado
    ABERTO (qualquer motorista pode aceitar)."""
    cliente = session.get(Cliente, demanda_in.cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    endereco = session.get(Endereco, demanda_in.endereco_id)
    if not endereco:
        raise HTTPException(status_code=404, detail="Endereço não encontrado")

    if demanda_in.motorista_id is not None:
        motorista = session.get(User, demanda_in.motorista_id)
        if not motorista:
            raise HTTPException(status_code=404, detail="Motorista não encontrado")

    for item_in in demanda_in.itens:
        produto = session.get(Item, item_in.produto_id)
        if not produto:
            raise HTTPException(
                status_code=404,
                detail=f"Produto {item_in.produto_id} não encontrado",
            )

    demanda = DemandaVenda(
        cliente_id=demanda_in.cliente_id,
        endereco_id=demanda_in.endereco_id,
        motorista_id=demanda_in.motorista_id,
        observacao=demanda_in.observacao,
        criado_por_id=current_user.id,
    )
    session.add(demanda)
    session.flush()

    for item_in in demanda_in.itens:
        session.add(
            DemandaVendaItem(
                demanda_id=demanda.id,
                produto_id=item_in.produto_id,
                quantidade=item_in.quantidade,
            )
        )

    session.commit()
    session.refresh(demanda)
    return _to_demanda_public(session, demanda)


@router.patch(
    "/demandas-venda/{demanda_id}/aceitar",
    response_model=DemandaVendaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="update"))],
)
def aceitar_demanda_venda(
    *,
    session: SessionDep,
    demanda_id: uuid.UUID,
    aceitar_in: DemandaVendaAceitarRequest = DemandaVendaAceitarRequest(),
) -> Any:
    """Motorista aceita o chamado -- só a partir de 'pendente'. Se o
    chamado estava ABERTO (motorista_id NULL), aceitar_in.motorista_id
    é obrigatório: é quem está assumindo o chamado. Se já tinha um
    motorista definido, motorista_id do corpo é ignorado.

    400 aqui geralmente significa que outro motorista já assumiu esse
    mesmo chamado aberto entre a última leitura da lista e este toque
    -- corrida normal em chamado aberto, não é bug (o frontend deve
    mostrar mensagem específica, não erro genérico)."""
    demanda = session.get(DemandaVenda, demanda_id)
    if not demanda:
        raise HTTPException(status_code=404, detail="Chamado não encontrado")
    if demanda.status != "pendente":
        raise HTTPException(
            status_code=400,
            detail=f"Este chamado já foi respondido (status atual: '{demanda.status}')",
        )

    if demanda.motorista_id is None:
        if aceitar_in.motorista_id is None:
            raise HTTPException(
                status_code=400,
                detail="motorista_id é obrigatório para aceitar um chamado aberto",
            )
        motorista = session.get(User, aceitar_in.motorista_id)
        if not motorista:
            raise HTTPException(status_code=404, detail="Motorista não encontrado")
        demanda.motorista_id = aceitar_in.motorista_id

    demanda.status = "aceita"
    demanda.respondida_em = get_datetime_utc()
    session.add(demanda)
    session.commit()
    session.refresh(demanda)
    return _to_demanda_public(session, demanda)


@router.patch(
    "/demandas-venda/{demanda_id}/recusar",
    response_model=DemandaVendaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="delete"))],
)
def recusar_demanda_venda(*, session: SessionDep, demanda_id: uuid.UUID) -> Any:
    """LEGADO -- o app do motorista não chama mais este endpoint (ver
    comentário de ciclo de vida em models.py: recusar deixou de ser
    uma ação do motorista, pra não gerar chamado "em limbo"). Gate de
    permissão reforçado pra ação "Apagar" (só atendente/gerente),
    justamente pra impedir um motorista de matar um chamado sozinho
    via chamada direta à API, contornando a regra de negócio. Mantido
    só por retrocompatibilidade -- considerar remover de vez depois
    que não houver mais nenhum cliente antigo do app em uso."""
    demanda = session.get(DemandaVenda, demanda_id)
    if not demanda:
        raise HTTPException(status_code=404, detail="Chamado não encontrado")
    if demanda.status != "pendente":
        raise HTTPException(
            status_code=400,
            detail=f"Este chamado já foi respondido (status atual: '{demanda.status}')",
        )

    demanda.status = "recusada"
    demanda.respondida_em = get_datetime_utc()
    session.add(demanda)
    session.commit()
    session.refresh(demanda)
    return _to_demanda_public(session, demanda)


@router.patch(
    "/demandas-venda/{demanda_id}/cancelar",
    response_model=DemandaVendaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="delete"))],
)
def cancelar_demanda_venda(*, session: SessionDep, demanda_id: uuid.UUID) -> Any:
    """SÓ o atendente/gerente cancela (ação "Apagar" do módulo
    delegacao -- Motorista não tem). Funciona de QUALQUER estado
    ativo (pendente ou aceita), não só de um estado específico --
    decisão do Ricardo: o atendente não precisa saber em que estado
    o chamado está, só tem a intenção de interromper um trabalho que
    seria em vão se continuado (ex: cliente ligou de novo desistindo).

    Preenche finalizada_em (mesmo campo usado por "concluir" -- ver
    comentário em models.py) -- é o `status` que diferencia os dois
    motivos de encerramento pro frontend.

    Bloqueia 400 se o chamado já estiver 'concluida' ou 'cancelada'
    (terminal) -- recancelar sobrescreveria o timestamp de um
    encerramento que já aconteceu de verdade."""
    demanda = session.get(DemandaVenda, demanda_id)
    if not demanda:
        raise HTTPException(status_code=404, detail="Chamado não encontrado")
    if demanda.status not in ESTADOS_CANCELAVEIS:
        raise HTTPException(
            status_code=400,
            detail=f"Chamado já está encerrado (status atual: '{demanda.status}'), nada a cancelar",
        )

    demanda.status = "cancelada"
    demanda.finalizada_em = get_datetime_utc()
    session.add(demanda)
    session.commit()
    session.refresh(demanda)
    return _to_demanda_public(session, demanda)


@router.patch(
    "/demandas-venda/{demanda_id}/reatribuir",
    response_model=DemandaVendaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="delete"))],
)
def reatribuir_demanda_venda(
    *,
    session: SessionDep,
    demanda_id: uuid.UUID,
    reatribuir_in: DemandaVendaReatribuirRequest,
) -> Any:
    """SÓ o atendente/gerente reatribui (ação "Apagar" do módulo
    delegacao). Troca motorista_id (ou volta pra None = reabre como
    chamado ABERTO) e volta o status pra 'pendente' -- o novo
    motorista precisa aceitar de novo, reaproveitando o fluxo de
    convite direto que já existe. MESMO REGISTRO, não cria um chamado
    novo (decisão do Ricardo).

    Só funciona a partir de 'pendente' por enquanto -- reatribuir um
    chamado já 'aceita' tiraria de um motorista que talvez já esteja a
    caminho, fora de escopo por agora."""
    demanda = session.get(DemandaVenda, demanda_id)
    if not demanda:
        raise HTTPException(status_code=404, detail="Chamado não encontrado")
    if demanda.status != "pendente":
        raise HTTPException(
            status_code=400,
            detail=f"Só é possível reatribuir um chamado pendente (status atual: '{demanda.status}')",
        )

    if reatribuir_in.motorista_id is not None:
        motorista = session.get(User, reatribuir_in.motorista_id)
        if not motorista:
            raise HTTPException(status_code=404, detail="Motorista não encontrado")

    demanda.motorista_id = reatribuir_in.motorista_id
    demanda.respondida_em = None
    session.add(demanda)
    session.commit()
    session.refresh(demanda)
    return _to_demanda_public(session, demanda)


@router.patch(
    "/demandas-venda/{demanda_id}/concluir",
    response_model=DemandaVendaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="update"))],
)
def concluir_demanda_venda(*, session: SessionDep, demanda_id: uuid.UUID) -> Any:
    """Motorista marca 'cheguei ao destino' -- só a partir de
    'aceita'. ENCERRA o chamado (some do mapa e da lista do
    motorista); a venda em si acontece depois, separadamente, na
    tela de Vendas -- não é automática aqui."""
    demanda = session.get(DemandaVenda, demanda_id)
    if not demanda:
        raise HTTPException(status_code=404, detail="Chamado não encontrado")
    if demanda.status != "aceita":
        raise HTTPException(
            status_code=400,
            detail=f"Só é possível concluir um chamado aceito (status atual: '{demanda.status}')",
        )

    demanda.status = "concluida"
    demanda.finalizada_em = get_datetime_utc()
    session.add(demanda)
    session.commit()
    session.refresh(demanda)
    return _to_demanda_public(session, demanda)


# ---------------------------------------------------------------------------
# Rotas — Localização de Motorista
# ---------------------------------------------------------------------------

@router.put(
    "/motoristas/{motorista_id}/localizacao",
    response_model=MotoristaLocalizacaoPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="update"))],
)
def upsert_localizacao_motorista(
    *,
    session: SessionDep,
    motorista_id: uuid.UUID,
    localizacao_in: MotoristaLocalizacaoUpdate,
) -> Any:
    """Ping de localização -- upsert puro (1 linha por motorista,
    sobrescrita sempre). Sem histórico de propósito (ver comentário em
    MotoristaLocalizacao, models.py). Gate de permissão é o módulo
    'delegacao' por enquanto -- quando o app do motorista existir
    (Fase 4) isso pode restringir pra 'o próprio motorista só atualiza
    a própria localização', mas essa regra ainda não foi desenhada."""
    motorista = session.get(User, motorista_id)
    if not motorista:
        raise HTTPException(status_code=404, detail="Motorista não encontrado")

    loc = session.get(MotoristaLocalizacao, motorista_id)
    if loc:
        loc.latitude = localizacao_in.latitude
        loc.longitude = localizacao_in.longitude
        loc.atualizado_em = get_datetime_utc()
    else:
        loc = MotoristaLocalizacao(
            motorista_id=motorista_id,
            latitude=localizacao_in.latitude,
            longitude=localizacao_in.longitude,
        )
    session.add(loc)
    session.commit()
    session.refresh(loc)
    return _to_localizacao_public(session, loc)


@router.get(
    "/motoristas/localizacao",
    response_model=MotoristasLocalizacaoPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_localizacoes_motoristas(session: SessionDep) -> Any:
    """Última posição conhecida de cada motorista que já deu ao menos
    1 ping -- base pros marcadores do mapa do atendente."""
    locs = session.exec(select(MotoristaLocalizacao)).all()
    return MotoristasLocalizacaoPublic(
        data=[_to_localizacao_public(session, loc) for loc in locs]
    )


# ---------------------------------------------------------------------------
# Rotas — Disponibilidade de Motorista
# ---------------------------------------------------------------------------

@router.put(
    "/motoristas/{motorista_id}/disponibilidade",
    response_model=MotoristaDisponibilidadePublic,
    dependencies=[Depends(require_module_permission(MODULE, action="update"))],
)
def atualizar_disponibilidade_motorista(
    *,
    session: SessionDep,
    motorista_id: uuid.UUID,
    disponibilidade_in: MotoristaDisponibilidadeUpdate,
) -> Any:
    """Liga/desliga a disponibilidade de um motorista pra receber
    chamado. Chamado tanto pelo próprio motorista (toggle no app,
    mesma permissão que ele já usa pra localização) quanto por uma
    futura tela gerencial (gerente/operador, que também têm Editar
    no módulo delegacao)."""
    motorista = session.get(User, motorista_id)
    if not motorista:
        raise HTTPException(status_code=404, detail="Motorista não encontrado")

    motorista.disponivel = disponibilidade_in.disponivel
    session.add(motorista)
    session.commit()
    session.refresh(motorista)
    return MotoristaDisponibilidadePublic(
        motorista_id=motorista.id,
        motorista_nome=_motorista_nome(motorista) or motorista.email,
        disponivel=motorista.disponivel,
    )


@router.get(
    "/motoristas/disponibilidade",
    response_model=MotoristasDisponibilidadePublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_disponibilidade_motoristas(session: SessionDep) -> Any:
    """Todos os usuários com role Motorista + status de
    disponibilidade atual -- usado pra filtrar o combo de despacho em
    /chamado (só disponíveis) e por uma futura tela gerencial."""
    role = session.exec(select(Role).where(Role.name == ROLE_MOTORISTA)).first()
    if not role:
        return MotoristasDisponibilidadePublic(data=[])

    motoristas = session.exec(
        select(User)
        .join(UserRole, UserRole.user_id == User.id)
        .where(UserRole.role_id == role.id)
    ).all()

    return MotoristasDisponibilidadePublic(
        data=[
            MotoristaDisponibilidadePublic(
                motorista_id=m.id,
                motorista_nome=_motorista_nome(m) or m.email,
                disponivel=m.disponivel,
            )
            for m in motoristas
        ]
    )
