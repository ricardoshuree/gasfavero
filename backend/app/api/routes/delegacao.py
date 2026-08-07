# [mcp-local harness] feature: painel-mapa-backend | plano: 326a78ae | 2026-08-07 09:39:06
# Adiciona endpoint GET /demandas-venda/hoje (fuso America/Sao_Paulo)
"""
Rotas de Chamado (nome de exibição; endpoints/paths continuam
"demandas-venda" internamente -- mesmo padrão de divergência
técnico/negócio de Item/Produto). Controle de acesso via módulo RBAC
"delegacao" (já existente desde a migration b7c8d9e0f1a2).

Ciclo de vida de um Chamado:
  pendente  -> aceita     (motorista aceita; se estava aberto -- sem
                           motorista_id -- quem aceita assume o
                           chamado, ver aceitar_demanda_venda)
  pendente  -> recusada   (fim de linha; atendente despacha um
                           chamado NOVO se for o caso)
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
    DemandasVendaPublic,
    Endereco,
    EnderecoPublic,
    Item,
    MotoristaLocalizacao,
    MotoristaLocalizacaoPublic,
    MotoristaLocalizacaoUpdate,
    MotoristasLocalizacaoPublic,
    Rua,
    User,
    get_datetime_utc,
)

router = APIRouter(tags=["delegacao"])

MODULE = "delegacao"

STATUS_VALIDOS = ("pendente", "aceita", "recusada", "concluida")

# Fuso de Veranópolis/RS -- usado só pra decidir os limites de "hoje"
# no painel de Chamadas hoje (ver read_demandas_hoje). created_at
# continua gravado em UTC no banco como sempre; aqui só convertemos
# os LIMITES do dia local pra UTC na hora de montar a query.
FUSO_BRASIL = ZoneInfo("America/Sao_Paulo")


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
    status: Literal["pendente", "aceita", "recusada", "concluida"] | None = None,
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
    return DemandasVendaPublic(
        data=[_to_demanda_public(session, d) for d in demandas]
    )


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
    recusados hoje simplesmente não aparecem em nenhum dos dois
    grupos (são um beco sem saída já resolvido em outro lugar).

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
    return DemandasVendaPublic(
        data=[_to_demanda_public(session, d) for d in demandas]
    )


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
    motorista definido, motorista_id do corpo é ignorado."""
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
    dependencies=[Depends(require_module_permission(MODULE, action="update"))],
)
def recusar_demanda_venda(*, session: SessionDep, demanda_id: uuid.UUID) -> Any:
    """Recusa o chamado -- só a partir de 'pendente'. Não existe
    reatribuição automática: o atendente vê a recusa na lista e
    despacha um chamado NOVO pra outro motorista, se for o caso."""
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
