# [mcp-local harness] feature: ranking-so-motoristas | plano: 241c372b | 2026-08-07 12:03:14
# Ranking so lista quem tem role Motorista, sempre 3 slots mesmo com 0 vendas
"""
Rotas de Venda (venda de balcão da distribuidora). Controle de acesso
via módulo RBAC "vendas".

Uma Venda é criada numa única chamada (cabeçalho + itens da "sacola"),
dentro de uma transação: se qualquer item falhar (produto sem preço,
vale inválido, etc.) nada é gravado.

Preço de cada item vem da linha vigente de Preco no momento da venda
-- essa linha é imutável (ver comentário em Preco, models.py), então
reajustes futuros de preço nunca afetam vendas já registradas.
"""
import calendar
import uuid
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func as sa_func
from sqlalchemy import or_
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, require_module_permission
from app.models import (
    AnosDisponiveisPublic,
    Bairro,
    BlocoVale,
    Cidade,
    Cliente,
    Endereco,
    EnderecoPublic,
    InadimplentesMotoristaPublic,
    InadimplentesMotoristasPublic,
    InadimplentesResumoPublic,
    Item,
    LivroVendasBucket,
    LivroVendasFormaPagamentoValor,
    LivroVendasListPublic,
    LivroVendasResumoPublic,
    Preco,
    ProximoValeNumeroPublic,
    RankingMotoristaPublic,
    RankingSemanaPublic,
    ResumoRecebimentoValePublic,
    Role,
    Rua,
    User,
    UserRole,
    Vale,
    Venda,
    VendaBaixarValeRequest,
    VendaCreate,
    VendaItem,
    VendaItemPublic,
    VendaMarcarPagoRequest,
    VendaPublic,
    VendasPublic,
    get_datetime_utc,
)

router = APIRouter(prefix="/vendas", tags=["vendas"])

MODULE = "vendas"

# Módulo próprio do Livro de Vendas -- separado de "vendas" de
# propósito (decisão do Ricardo), pra poder restringir o acesso
# independentemente (ex: só "gerente"), diferente do Recebimento de
# Vale que reaproveita o módulo "vendas".
MODULE_LIVRO = "livro_vendas"

# Módulo da tela de Inadimplentes -- reaproveita "inadimplencia", já
# cadastrado no banco desde a migration de módulos de negócio
# (b7c8d9e0f1a2) e nunca usado até agora. Não precisou de migration
# nova.
MODULE_INADIMPLENCIA = "inadimplencia"

# Limite de dias corridos desde a venda pra considerar um vale em
# aberto "em atraso" (contado a partir de data_venda, decisão do
# Ricardo -- não da data prevista de pagamento).
DIAS_ATRASO_VALE = 30

# Ordem fixa de exibição do detalhamento "Em caixa" por forma de
# pagamento no Livro de Vendas (pedido do Ricardo) -- sempre as 4
# presentes na resposta, mesmo com valor 0.
FORMAS_PAGAMENTO_ORDEM = ["cartao", "pix", "dinheiro", "vale"]


# ---------------------------------------------------------------------------
# Helpers internos
# ---------------------------------------------------------------------------

def _preco_vigente(session: SessionDep, produto_id: uuid.UUID) -> Preco | None:
    return session.exec(
        select(Preco)
        .where(Preco.produto_id == produto_id)
        .where(col(Preco.valid_to).is_(None))
    ).first()


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
    )


def _quinto_dia_util_proximo_mes(hoje: date | None = None) -> date:
    """5º dia útil (seg-sex) do mês seguinte -- default de
    data_pagamento_vale (decisão do Ricardo: dá previsibilidade ao
    cliente alinhada com o pagamento do salário).

    NÃO considera feriados (só fins de semana) -- o campo continua
    editável na hora da venda pra ajustar manualmente se cair num
    feriado."""
    hoje = hoje or date.today()
    if hoje.month == 12:
        ano, mes = hoje.year + 1, 1
    else:
        ano, mes = hoje.year, hoje.month + 1

    ultimo_dia = calendar.monthrange(ano, mes)[1]
    d = date(ano, mes, 1)
    dias_uteis = 0
    while d.day <= ultimo_dia:
        if d.weekday() < 5:  # 0=segunda ... 4=sexta
            dias_uteis += 1
            if dias_uteis == 5:
                return d
        d += timedelta(days=1)
    # Fallback teórico (não deveria acontecer num mês normal)
    return d


def _limites_mes_vigente(hoje: date) -> tuple[date, date]:
    """(primeiro dia do mês atual, primeiro dia do mês seguinte) --
    intervalo [primeiro, proximo) usado pro card 'vales pagos no mês'
    (filtra por pago_em, não por data_venda)."""
    primeiro = hoje.replace(day=1)
    if hoje.month == 12:
        proximo = date(hoje.year + 1, 1, 1)
    else:
        proximo = date(hoje.year, hoje.month + 1, 1)
    return primeiro, proximo


def _to_venda_public(session: SessionDep, venda: Venda) -> VendaPublic:
    cliente = session.get(Cliente, venda.cliente_id)
    motorista = session.get(User, venda.motorista_id)
    endereco = session.get(Endereco, venda.endereco_id) if venda.endereco_id else None
    vale = session.get(Vale, venda.vale_id) if venda.vale_id else None
    recebido_por = (
        session.get(User, venda.recebido_por_id) if venda.recebido_por_id else None
    )

    itens = session.exec(
        select(VendaItem).where(VendaItem.venda_id == venda.id)
    ).all()
    itens_public = []
    for item in itens:
        produto = session.get(Item, item.produto_id)
        preco = session.get(Preco, item.preco_id)
        itens_public.append(
            VendaItemPublic(
                id=item.id,
                produto_id=item.produto_id,
                produto_title=produto.title if produto else "?",
                quantidade=item.quantidade,
                preco_unitario=preco.valor if preco else item.subtotal,
                subtotal=item.subtotal,
            )
        )

    return VendaPublic(
        id=venda.id,
        cliente_id=venda.cliente_id,
        cliente_nome=cliente.nome if cliente else "?",
        endereco=_to_endereco_public(session, endereco) if endereco else None,
        motorista_id=venda.motorista_id,
        motorista_nome=(motorista.full_name or motorista.email) if motorista else "?",
        forma_pagamento=venda.forma_pagamento,
        vale_numero=vale.numero if vale else None,
        data_pagamento_vale=venda.data_pagamento_vale,
        valor_total=venda.valor_total,
        valor_pago=venda.valor_pago,
        data_venda=venda.data_venda,
        pago_em=venda.pago_em,
        recebido_em=venda.recebido_em,
        recebido_por_nome=(
            (recebido_por.full_name or recebido_por.email) if recebido_por else None
        ),
        criado_por_id=venda.criado_por_id,
        created_at=venda.created_at,
        itens=itens_public,
    )


# ---------------------------------------------------------------------------
# Rotas
# ---------------------------------------------------------------------------

@router.get(
    "/",
    response_model=VendasPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_vendas(session: SessionDep, skip: int = 0, limit: int = 100) -> Any:
    count = session.exec(select(func.count()).select_from(Venda)).one()
    vendas = session.exec(
        select(Venda).order_by(col(Venda.created_at).desc()).offset(skip).limit(limit)
    ).all()
    return VendasPublic(
        data=[_to_venda_public(session, v) for v in vendas], count=count
    )


@router.get(
    "/cliente/{cliente_id}/ultimo-endereco",
    response_model=EnderecoPublic | None,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_ultimo_endereco_cliente(session: SessionDep, cliente_id: uuid.UUID) -> Any:
    """Endereço usado na venda mais recente desse cliente (não
    necessariamente o vigente no cadastro -- se o cliente mudou de
    casa mas a última entrega combinada foi no endereço antigo, é
    esse que faz sentido sugerir de novo). Retorna null se o cliente
    nunca teve endereço registrado numa venda."""
    ultima_venda_com_endereco = session.exec(
        select(Venda)
        .where(Venda.cliente_id == cliente_id)
        .where(col(Venda.endereco_id).is_not(None))
        .order_by(col(Venda.created_at).desc())
    ).first()
    if not ultima_venda_com_endereco:
        return None
    endereco = session.get(Endereco, ultima_venda_com_endereco.endereco_id)
    if not endereco:
        return None
    return _to_endereco_public(session, endereco)


@router.get(
    "/cliente/{cliente_id}/historico",
    response_model=VendasPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_historico_vendas_cliente(
    session: SessionDep, cliente_id: uuid.UUID, limit: int = 3
) -> Any:
    """Últimas vendas desse cliente (mais recente primeiro) -- pedido
    do Giovani: mostrar contexto rápido (data, valor pago, endereço,
    status) no painel de cliente da tela de Vendas, assim que o
    cliente é identificado. `count` é o total histórico do cliente
    (não só o que veio na página), pra a UI poder mostrar "últimas 3
    de N" se quiser."""
    count = session.exec(
        select(func.count())
        .select_from(Venda)
        .where(Venda.cliente_id == cliente_id)
    ).one()
    vendas = session.exec(
        select(Venda)
        .where(Venda.cliente_id == cliente_id)
        .order_by(col(Venda.created_at).desc())
        .limit(limit)
    ).all()
    return VendasPublic(
        data=[_to_venda_public(session, v) for v in vendas], count=count
    )


@router.get(
    "/proximo-numero-vale/{motorista_id}",
    response_model=ProximoValeNumeroPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_proximo_numero_vale(session: SessionDep, motorista_id: uuid.UUID) -> Any:
    """Primeiro número de vale ainda não usado, dentro do(s) bloco(s)
    de vale atribuído(s) a esse motorista -- sugestão pro campo
    "número do vale" na tela de venda. Percorre os blocos do
    motorista em ordem de criação; dentro de cada um, pega o menor
    número que ainda não apareceu em nenhuma Venda. Continua 100%
    editável no frontend -- isso é só um ponto de partida."""
    blocos = session.exec(
        select(BlocoVale)
        .where(BlocoVale.motorista_id == motorista_id)
        .order_by(BlocoVale.created_at)
    ).all()

    usados_subquery = select(Venda.vale_id).where(col(Venda.vale_id).is_not(None))

    for bloco in blocos:
        vale_livre = session.exec(
            select(Vale)
            .where(Vale.bloco_id == bloco.id)
            .where(col(Vale.id).not_in(usados_subquery))
            .order_by(Vale.numero)
        ).first()
        if vale_livre:
            return ProximoValeNumeroPublic(numero=vale_livre.numero)

    return ProximoValeNumeroPublic(numero=None)


# ---------------------------------------------------------------------------
# Recebimento de Vale
#
# Estados de uma venda em vale (ver bloco de comentário em models.py,
# na classe Venda):
#   1) em aberto        -- recebido_em IS NULL, pago_em IS NULL, <30 dias
#   2) em atraso         -- recebido_em IS NULL, pago_em IS NULL, >=30 dias
#      (mesma condição de banco que "em aberto" -- a diferença é só a
#      data_venda, não um campo separado)
#   3) aguardando baixa -- recebido_em IS NOT NULL, pago_em IS NULL
#   4) baixada          -- pago_em IS NOT NULL (SEMPRE definitivo --
#      a baixa nunca reabre a venda, mesmo com valor menor que o
#      total; a diferença é tratada como desconto)
#
# A TABELA da tela (GET /vales-recebimento) mostra os estados 1+2+3
# juntos por padrão (status="todos") -- só o que já foi baixado (4)
# nunca aparece. O botão "Pagos" da UI só filtra pra status="aguardando_baixa"
# (só o estado 3), não é uma view exclusiva/separada.
#
# Precisam vir ANTES de "/{id}" nesse arquivo -- senão o FastAPI casa
# "vales-recebimento" como se fosse o {id} da rota genérica abaixo.
# ---------------------------------------------------------------------------

def _query_base_vale_pendente(*, status: Literal["aberto", "aguardando_baixa"]):
    """Usado só pelo cálculo dos cards do resumo (que precisa separar
    aberto de aguardando_baixa pra contar cada um). A listagem da
    tabela (read_vales_recebimento) usa uma query própria, que por
    padrão junta aberto+atrasado+aguardando_baixa."""
    query = (
        select(Venda)
        .where(Venda.forma_pagamento == "vale")
        .where(col(Venda.pago_em).is_(None))
    )
    if status == "aberto":
        return query.where(col(Venda.recebido_em).is_(None))
    return query.where(col(Venda.recebido_em).is_not(None))


@router.get(
    "/vales-recebimento/resumo",
    response_model=ResumoRecebimentoValePublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_resumo_recebimento_vale(session: SessionDep) -> Any:
    hoje = date.today()
    limite_atraso = hoje - timedelta(days=DIAS_ATRASO_VALE)
    primeiro_dia_mes, primeiro_dia_prox_mes = _limites_mes_vigente(hoje)

    em_aberto = session.exec(_query_base_vale_pendente(status="aberto")).all()
    aguardando_baixa = session.exec(
        _query_base_vale_pendente(status="aguardando_baixa")
    ).all()
    atraso = [v for v in em_aberto if v.data_venda <= limite_atraso]

    # "Vales pagos no mês": baixados (pago_em preenchido) cujo pago_em
    # cai no mês vigente -- filtra por QUANDO foi dada a baixa, não
    # por quando a venda foi feita.
    pagos_mes = session.exec(
        select(Venda)
        .where(Venda.forma_pagamento == "vale")
        .where(col(Venda.pago_em).is_not(None))
        .where(func.date(Venda.pago_em) >= primeiro_dia_mes)
        .where(func.date(Venda.pago_em) < primeiro_dia_prox_mes)
    ).all()

    def soma_valor_total(vendas: list[Venda]) -> Decimal:
        return sum((v.valor_total for v in vendas), Decimal("0"))

    def soma_valor_pago(vendas: list[Venda]) -> Decimal:
        return sum((v.valor_pago for v in vendas), Decimal("0"))

    return ResumoRecebimentoValePublic(
        em_aberto_qtd=len(em_aberto),
        em_aberto_valor=soma_valor_total(em_aberto),
        atraso_qtd=len(atraso),
        atraso_valor=soma_valor_total(atraso),
        aguardando_baixa_qtd=len(aguardando_baixa),
        aguardando_baixa_valor=soma_valor_pago(aguardando_baixa),
        pagos_mes_qtd=len(pagos_mes),
        pagos_mes_valor=soma_valor_pago(pagos_mes),
    )


@router.get(
    "/vales-recebimento",
    response_model=VendasPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_vales_recebimento(
    session: SessionDep,
    status: Literal["todos", "aguardando_baixa"] = "todos",
    busca_numero: int | None = None,
    order_by: Literal["data_venda", "valor_total", "cliente"] = "data_venda",
    order_dir: Literal["asc", "desc"] = "desc",
    skip: int = 0,
    limit: int = 20,
) -> Any:
    """"todos" (default): junta em_aberto + em_atraso + aguardando_baixa
    (tudo que ainda não foi baixado). "aguardando_baixa": só o que já
    foi marcado como pago, esperando a baixa -- é o filtro que o botão
    "Pagos" da UI aplica em cima da mesma tabela, não uma tela separada."""
    query = (
        select(Venda)
        .where(Venda.forma_pagamento == "vale")
        .where(col(Venda.pago_em).is_(None))
    )
    if status == "aguardando_baixa":
        query = query.where(col(Venda.recebido_em).is_not(None))

    if busca_numero is not None:
        vale_ids = select(Vale.id).where(Vale.numero == busca_numero)
        query = query.where(col(Venda.vale_id).in_(vale_ids))

    count = session.exec(select(func.count()).select_from(query.subquery())).one()

    if order_by == "cliente":
        query = query.join(Cliente, Cliente.id == Venda.cliente_id)
        order_col = Cliente.nome
    elif order_by == "valor_total":
        order_col = Venda.valor_total
    else:
        order_col = Venda.data_venda

    query = query.order_by(
        order_col.desc() if order_dir == "desc" else order_col.asc()
    )
    vendas = session.exec(query.offset(skip).limit(limit)).all()

    return VendasPublic(
        data=[_to_venda_public(session, v) for v in vendas], count=count
    )


def _validar_venda_vale_aberta(venda: Venda | None) -> Venda:
    if not venda:
        raise HTTPException(status_code=404, detail="Venda não encontrada")
    if venda.forma_pagamento != "vale":
        raise HTTPException(
            status_code=400, detail="Essa operação só vale pra vendas em vale"
        )
    if venda.pago_em is not None:
        raise HTTPException(status_code=400, detail="Este vale já foi baixado")
    return venda


@router.patch(
    "/{id}/marcar-pago",
    response_model=VendaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="update"))],
)
def marcar_venda_pago(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    body: VendaMarcarPagoRequest,
) -> Any:
    """Registra que o valor foi recebido -- hoje só usado pelo
    operador na tela de Recebimento de Vale, no futuro também pelo
    motorista numa interface própria em campo. NÃO fecha a venda --
    só move ela pra fila 'aguardando baixa'."""
    venda = _validar_venda_vale_aberta(session.get(Venda, id))

    if body.valor_pago < venda.valor_pago:
        raise HTTPException(
            status_code=400,
            detail="O valor pago não pode ser menor que o já registrado",
        )
    if body.valor_pago > venda.valor_total:
        raise HTTPException(
            status_code=400,
            detail="O valor pago não pode ser maior que o valor total da venda",
        )

    venda.valor_pago = body.valor_pago
    venda.recebido_em = get_datetime_utc()
    venda.recebido_por_id = current_user.id
    session.add(venda)
    session.commit()
    session.refresh(venda)
    return _to_venda_public(session, venda)


@router.patch(
    "/{id}/baixar-vale",
    response_model=VendaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="update"))],
)
def baixar_vale(
    *, session: SessionDep, id: uuid.UUID, body: VendaBaixarValeRequest
) -> Any:
    """Confirma oficialmente o recebimento na distribuidora (sempre
    feito aqui, nunca em campo) e FECHA a venda de vez (pago_em) --
    não importa o valor. Se o valor confirmado for menor que
    valor_total, a diferença é um desconto: não deixa a venda em
    aberto de novo (decisão do Ricardo -- ver comentário em Venda,
    models.py)."""
    venda = _validar_venda_vale_aberta(session.get(Venda, id))

    if venda.recebido_em is None:
        raise HTTPException(
            status_code=400,
            detail="É preciso marcar como pago antes de dar a baixa",
        )

    valor_pago = body.valor_pago if body.valor_pago is not None else venda.valor_pago

    if valor_pago < venda.valor_pago:
        raise HTTPException(
            status_code=400,
            detail="O valor pago não pode ser menor que o já registrado",
        )
    if valor_pago > venda.valor_total:
        raise HTTPException(
            status_code=400,
            detail="O valor pago não pode ser maior que o valor total da venda",
        )

    venda.valor_pago = valor_pago
    venda.pago_em = get_datetime_utc()

    session.add(venda)
    session.commit()
    session.refresh(venda)
    return _to_venda_public(session, venda)


# ---------------------------------------------------------------------------
# Livro de Vendas
#
# Dashboard geral de TODAS as vendas (qualquer forma de pagamento --
# diferente do Recebimento de Vale, que é só vale). Módulo RBAC
# próprio ("livro_vendas", ver migration f1a2b3c4d5e6), separado de
# "vendas".
#
# Menu interativo de 3 linhas, mutuamente exclusivas entre si (só um
# "escopo" ativo por vez), decide o drill-down do gráfico e o período
# usado pelos 2 cards (tudo agrupado por data_venda, nunca por
# pago_em/recebido_em):
#
#   escopo="todos_anos"  -- todo o histórico. Gráfico: 1 barra por ano
#                            com venda registrada.
#   escopo="ano"          -- requer `ano`. Gráfico: 1 barra por mês
#                            (Jan-Dez) daquele ano.
#   escopo="mes"          -- requer `ano` + `mes`. Gráfico: 1 barra por
#                            semana (dom-sáb, cortada nos limites do
#                            mês) daquele mês. Usado tanto pelo clique
#                            direto num mês quanto pelo atalho "todas
#                            as semanas" (que sempre manda o mês/ano
#                            VIGENTE, sobrescrevendo qualquer seleção
#                            de ano/mês feita antes) -- e é o escopo
#                            default ao carregar a tela.
#   escopo="semana"       -- sem parâmetros (sempre a semana corrente,
#                            dom-sáb). Gráfico: 1 barra por dia.
#                            Atalho independente -- sempre pula pro
#                            "agora", ignorando ano/mês selecionados.
#
# A TABELA (GET /livro) é independente desse menu -- não filtra pelo
# escopo, tem paginação, filtro próprio de intervalo de datas e filtro
# de status. Além dos itens da página, retorna soma_preco/soma_valor_pago
# (ver LivroVendasListPublic, models.py) -- o total das colunas
# "Preço"/"Valor pago" de TODAS as vendas que batem com o filtro de data
# ativo (data_inicio/data_fim), não só as da página atual -- é o
# valor exibido na linha de totais no rodapé da tabela, que muda
# dinamicamente junto com o filtro 'Consulta vendas data'.
#
# Status possíveis pro filtro da tabela (independente do status
# calculado no frontend pro badge de cada linha, mas com a MESMA
# lógica):
#   "todos"     -- sem filtro (default)
#   "pago"      -- pago_em IS NOT NULL
#   "em_aberto" -- pago_em IS NULL E NÃO (vale com data_venda antiga)
#   "em_atraso" -- pago_em IS NULL E forma_pagamento=vale E
#                  data_venda <= hoje - DIAS_ATRASO_VALE
#
# Precisam vir ANTES de "/{id}" nesse arquivo -- mesmo motivo do bloco
# de Recebimento de Vale acima.
# ---------------------------------------------------------------------------

NOMES_DIA_SEMANA = [
    "Domingo",
    "Segunda",
    "Terça",
    "Quarta",
    "Quinta",
    "Sexta",
    "Sábado",
]

MESES_ABREV = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
]


def _semana_atual(hoje: date | None = None) -> tuple[date, date]:
    """(domingo, sábado) da semana corrente -- semana sempre começa
    no domingo (decisão do Ricardo)."""
    hoje = hoje or date.today()
    # date.weekday(): segunda=0 ... domingo=6. Convertendo pra
    # domingo=0 ... sábado=6 pra poder calcular o início da semana.
    dow_domingo_zero = (hoje.weekday() + 1) % 7
    inicio = hoje - timedelta(days=dow_domingo_zero)
    fim = inicio + timedelta(days=6)
    return inicio, fim


def _semanas_do_mes(ano: int, mes: int) -> list[tuple[date, date]]:
    """Divide o mês inteiro em buckets semanais (dom-sáb) -- o
    primeiro bucket começa no dia 1 (pode ser um bucket "curto", se o
    mês não começar num domingo) e o último termina no último dia do
    mês (idem). Buckets intermediários são semanas cheias."""
    ultimo_dia = calendar.monthrange(ano, mes)[1]
    fim_mes = date(ano, mes, ultimo_dia)
    cursor = date(ano, mes, 1)

    buckets: list[tuple[date, date]] = []
    while cursor <= fim_mes:
        dow_domingo_zero = (cursor.weekday() + 1) % 7
        dias_ate_sabado = 6 - dow_domingo_zero
        fim_bucket = min(cursor + timedelta(days=dias_ate_sabado), fim_mes)
        buckets.append((cursor, fim_bucket))
        cursor = fim_bucket + timedelta(days=1)
    return buckets


def _label_bucket_semana(inicio: date, fim: date) -> str:
    return f"{inicio.day:02d}/{inicio.month:02d}–{fim.day:02d}/{fim.month:02d}"


@router.get(
    "/livro/anos-disponiveis",
    response_model=AnosDisponiveisPublic,
    dependencies=[Depends(require_module_permission(MODULE_LIVRO, action="read"))],
)
def read_livro_anos_disponiveis(session: SessionDep) -> Any:
    """Até os 5 anos mais recentes com ao menos 1 venda, em ordem
    decrescente -- monta os botões da linha 'Ano' do menu interativo.
    Se houver um 6º ano de histórico, ele fica de fora daqui (mas
    continua acessível via escopo 'todos_anos', que não usa esta
    lista)."""
    datas = session.exec(select(Venda.data_venda)).all()
    anos = sorted({d.year for d in datas}, reverse=True)[:5]
    return AnosDisponiveisPublic(anos=anos)


@router.get(
    "/livro/resumo",
    response_model=LivroVendasResumoPublic,
    dependencies=[Depends(require_module_permission(MODULE_LIVRO, action="read"))],
)
def read_livro_resumo(
    session: SessionDep,
    escopo: Literal["todos_anos", "ano", "mes", "semana"] = "mes",
    ano: int | None = None,
    mes: int | None = None,
) -> Any:
    hoje = date.today()

    if escopo == "semana":
        periodo_inicio, periodo_fim = _semana_atual(hoje)
        buckets_def = [
            (
                NOMES_DIA_SEMANA[i],
                periodo_inicio + timedelta(days=i),
                periodo_inicio + timedelta(days=i),
            )
            for i in range(7)
        ]

    elif escopo == "mes":
        # Sem ano/mes informado (atalho "todas as semanas" e também o
        # default de carregamento da tela): usa sempre o mês vigente.
        ano_efetivo = ano or hoje.year
        mes_efetivo = mes or hoje.month
        if not (1 <= mes_efetivo <= 12):
            raise HTTPException(status_code=400, detail="Mês inválido")

        ultimo_dia = calendar.monthrange(ano_efetivo, mes_efetivo)[1]
        periodo_inicio = date(ano_efetivo, mes_efetivo, 1)
        periodo_fim = date(ano_efetivo, mes_efetivo, ultimo_dia)
        buckets_def = [
            (_label_bucket_semana(ini, fim), ini, fim)
            for ini, fim in _semanas_do_mes(ano_efetivo, mes_efetivo)
        ]

    elif escopo == "ano":
        if ano is None:
            raise HTTPException(status_code=400, detail="Informe o ano")
        periodo_inicio = date(ano, 1, 1)
        periodo_fim = date(ano, 12, 31)
        buckets_def = [
            (
                MESES_ABREV[m - 1],
                date(ano, m, 1),
                date(ano, m, calendar.monthrange(ano, m)[1]),
            )
            for m in range(1, 13)
        ]

    else:  # todos_anos
        primeira_data_venda = session.exec(select(func.min(Venda.data_venda))).one()
        ano_inicio = primeira_data_venda.year if primeira_data_venda else hoje.year
        periodo_inicio = date(ano_inicio, 1, 1)
        periodo_fim = date(hoje.year, 12, 31)
        buckets_def = [
            (str(a), date(a, 1, 1), date(a, 12, 31))
            for a in range(ano_inicio, hoje.year + 1)
        ]

    vendas_periodo = session.exec(
        select(Venda)
        .where(Venda.data_venda >= periodo_inicio)
        .where(Venda.data_venda <= periodo_fim)
    ).all()

    em_caixa = [v for v in vendas_periodo if v.pago_em is not None]
    em_aberto = [v for v in vendas_periodo if v.pago_em is None]

    grafico = []
    for label, bucket_inicio, bucket_fim in buckets_def:
        valor_bucket = sum(
            (
                v.valor_pago
                for v in em_caixa
                if bucket_inicio <= v.data_venda <= bucket_fim
            ),
            Decimal("0"),
        )
        grafico.append(LivroVendasBucket(label=label, valor=valor_bucket))

    # Detalhamento de "Em caixa" por forma de pagamento -- sempre as 4
    # formas presentes, na ordem fixa de FORMAS_PAGAMENTO_ORDEM, com
    # valor 0 pra quem não teve venda paga no período.
    em_caixa_por_forma_pagamento = [
        LivroVendasFormaPagamentoValor(
            forma_pagamento=forma,
            valor=sum(
                (v.valor_pago for v in em_caixa if v.forma_pagamento == forma),
                Decimal("0"),
            ),
        )
        for forma in FORMAS_PAGAMENTO_ORDEM
    ]

    return LivroVendasResumoPublic(
        em_caixa_qtd=len(em_caixa),
        em_caixa_valor=sum((v.valor_pago for v in em_caixa), Decimal("0")),
        em_caixa_por_forma_pagamento=em_caixa_por_forma_pagamento,
        em_aberto_qtd=len(em_aberto),
        em_aberto_valor=sum((v.valor_total for v in em_aberto), Decimal("0")),
        periodo_inicio=periodo_inicio,
        periodo_fim=periodo_fim,
        grafico=grafico,
    )


@router.get(
    "/livro",
    response_model=LivroVendasListPublic,
    dependencies=[Depends(require_module_permission(MODULE_LIVRO, action="read"))],
)
def read_livro_vendas(
    session: SessionDep,
    data_inicio: date | None = None,
    data_fim: date | None = None,
    status: Literal["todos", "pago", "em_aberto", "em_atraso"] = "todos",
    skip: int = 0,
    limit: int = 20,
) -> Any:
    """Tabela de TODAS as vendas (qualquer forma de pagamento),
    ordenada por data_venda mais recente primeiro -- independente do
    menu interativo (ano/mês/semana), com filtro próprio de intervalo
    de datas e de status.

    soma_preco/soma_valor_pago (linha de totais no rodapé da tabela,
    no frontend) são calculados sobre TODO o conjunto que bate com os
    filtros ativos -- não só os `limit` registros da página atual.
    Os mesmos filtros são aplicados de forma independente em 3 queries
    (count, soma, listagem paginada) -- evita reusar a subquery de uma
    pra fazer agregação de coluna da outra, o que gera SQL incorreto
    (a coluna mapeada Venda.x não corresponde à coluna da subquery)."""
    limite_atraso = date.today() - timedelta(days=DIAS_ATRASO_VALE)

    def _aplicar_filtros(stmt):
        if data_inicio is not None:
            stmt = stmt.where(Venda.data_venda >= data_inicio)
        if data_fim is not None:
            stmt = stmt.where(Venda.data_venda <= data_fim)

        if status == "pago":
            stmt = stmt.where(col(Venda.pago_em).is_not(None))
        elif status == "em_aberto":
            stmt = stmt.where(col(Venda.pago_em).is_(None)).where(
                or_(
                    Venda.forma_pagamento != "vale",
                    Venda.data_venda > limite_atraso,
                )
            )
        elif status == "em_atraso":
            stmt = (
                stmt.where(col(Venda.pago_em).is_(None))
                .where(Venda.forma_pagamento == "vale")
                .where(Venda.data_venda <= limite_atraso)
            )
        return stmt

    count = session.exec(
        _aplicar_filtros(select(func.count()).select_from(Venda))
    ).one()

    soma_preco, soma_valor_pago = session.exec(
        _aplicar_filtros(
            select(
                func.coalesce(func.sum(Venda.valor_total), 0),
                func.coalesce(func.sum(Venda.valor_pago), 0),
            )
        )
    ).one()

    vendas = session.exec(
        _aplicar_filtros(select(Venda))
        .order_by(col(Venda.data_venda).desc(), col(Venda.created_at).desc())
        .offset(skip)
        .limit(limit)
    ).all()

    return LivroVendasListPublic(
        data=[_to_venda_public(session, v) for v in vendas],
        count=count,
        soma_preco=soma_preco,
        soma_valor_pago=soma_valor_pago,
    )


# ---------------------------------------------------------------------------
# Ranking da Semana -- usado no painel lateral da tela Mapa. Reaproveita
# _semana_atual (definida acima, mesmo corte dom-sáb do Livro de
# Vendas). Precisa vir ANTES de "/{id}" nesse arquivo, mesmo motivo dos
# blocos anteriores.
# ---------------------------------------------------------------------------

@router.get(
    "/ranking-semana",
    response_model=RankingSemanaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_ranking_semana(session: SessionDep) -> Any:
    """Top 3 motoristas por QUANTIDADE de vendas na semana corrente
    (domingo-sábado) -- conta todas as vendas independente de forma
    de pagamento ou status de pagamento (é volume de atendimento, não
    faturamento).

    Só considera usuários com a role RBAC "Motorista" (decisão
    confirmada com o Ricardo) -- isso exclui automaticamente o
    usuário-sistema "Distribuidora Gás Favero" (vendas de balcão),
    que não tem essa role, mesmo que ele acumule vendas na semana.

    Sempre retorna até 3 motoristas, mesmo que algum deles não tenha
    NENHUMA venda na semana (quantidade=0) -- não é "top 3 de quem
    vendeu", é "top 3 dos motoristas cadastrados, ordenados por
    quantidade". Só retorna menos de 3 se houver menos de 3
    motoristas com essa role cadastrados."""
    periodo_inicio, periodo_fim = _semana_atual()
    vendas_periodo = session.exec(
        select(Venda)
        .where(Venda.data_venda >= periodo_inicio)
        .where(Venda.data_venda <= periodo_fim)
    ).all()

    contagem: dict[uuid.UUID, int] = {}
    for v in vendas_periodo:
        contagem[v.motorista_id] = contagem.get(v.motorista_id, 0) + 1

    # Case-insensitive de propósito -- mesmo padrão já usado em outras
    # buscas por nome neste projeto (ex: resolução de Rua em
    # clientes.py), evita depender de capitalização exata da role.
    role_motorista = session.exec(
        select(Role).where(sa_func.lower(Role.name) == "motorista")
    ).first()

    ranking: list[RankingMotoristaPublic] = []
    if role_motorista:
        motorista_ids = session.exec(
            select(UserRole.user_id).where(UserRole.role_id == role_motorista.id)
        ).all()
        for motorista_id in motorista_ids:
            motorista = session.get(User, motorista_id)
            if motorista:
                ranking.append(
                    RankingMotoristaPublic(
                        motorista_id=motorista_id,
                        motorista_nome=motorista.full_name or motorista.email,
                        quantidade=contagem.get(motorista_id, 0),
                    )
                )

    # Desempate por nome (A-Z) -- só pra ordem determinística entre
    # motoristas com a mesma quantidade (inclusive todos com 0).
    ranking.sort(key=lambda r: r.motorista_nome.lower())
    ranking.sort(key=lambda r: r.quantidade, reverse=True)

    return RankingSemanaPublic(
        periodo_inicio=periodo_inicio,
        periodo_fim=periodo_fim,
        motoristas=ranking[:3],
    )


# ---------------------------------------------------------------------------
# Inadimplentes
#
# Duas visões DELIBERADAMENTE diferentes na mesma tela (decisão
# confirmada com o Ricardo depois de ver a primeira versão em uso):
#
#   1) CARD + GRÁFICO (topo, menu Ano/Mês) -- visão HISTÓRICA/contábil:
#      "quantos estavam devendo naquele mês de vencimento", incluindo
#      quem já pagou depois de ficar mais de DIAS_ATRASO_VALE dias sem
#      quitar. Usa _vendas_inadimplentes() (todo o conjunto "esteve em
#      atraso"). Serve pra entender como a inadimplência se comportou
#      ao longo do tempo, não pra cobrança.
#
#   2) TABELA (embaixo, com filtro de motorista + Exportar PDF) --
#      visão de COBRANÇA: só quem está em aberto E em atraso AGORA
#      (pago_em IS NULL) -- exatamente os clientes que cada motorista
#      (inclusive o usuário-sistema "Distribuidora Gás Favero", que
#      "entrega" as vendas de balcão) precisa cobrar. Quem já pagou
#      NÃO aparece aqui, mesmo que tenha estado atrasado no passado --
#      ver _vendas_em_atraso_atual().
#
# _esteve_em_atraso() continua sendo a base das duas: não depende de
# nenhuma coluna nova, é 100% derivado de data_venda/pago_em já
# existentes (decisão confirmada: não vale a pena um snapshot
# histórico à parte).
#
#   - se JÁ PAGA: esteve em atraso se (pago_em.date() - data_venda)
#     foi >= DIAS_ATRASO_VALE (demorou pra pagar, mesmo que hoje
#     esteja quitada) -- só entra no card/gráfico (visão 1)
#   - se AINDA EM ABERTO: esteve em atraso se (hoje - data_venda) já
#     é >= DIAS_ATRASO_VALE -- entra nas DUAS visões
#
# Menu interativo tem só 2 linhas (Ano / Mês, SEM linha de Semana,
# diferente do Livro de Vendas) e agrupa por data_pagamento_vale
# (quando o vale VENCEU), não por data_venda -- decisão confirmada.
#
# A TABELA (GET /inadimplentes) é independente do menu -- sem filtro
# de período, só filtrável por motorista_id (pra cada motorista gerar
# seu próprio PDF de cobrança), ordenada por data_venda mais ANTIGA
# primeiro (quem está esperando há mais tempo primeiro).
#
# Exportar PDF é gerado 100% no frontend (dump simples da tabela já
# carregada, respeitando o filtro de motorista ativo) -- não existe
# endpoint de PDF aqui.
#
# Módulo RBAC "inadimplencia" (reaproveitado, ver MODULE_INADIMPLENCIA
# acima). Precisam vir ANTES de "/{id}" nesse arquivo -- mesmo motivo
# dos blocos anteriores.
# ---------------------------------------------------------------------------

def _esteve_em_atraso(venda: Venda, hoje: date) -> bool:
    """Ver bloco de comentário acima -- base das duas visões (card/
    gráfico histórico E tabela de cobrança atual)."""
    if venda.forma_pagamento != "vale":
        return False
    if venda.pago_em is not None:
        dias = (venda.pago_em.date() - venda.data_venda).days
        return dias >= DIAS_ATRASO_VALE
    dias = (hoje - venda.data_venda).days
    return dias >= DIAS_ATRASO_VALE


def _vendas_inadimplentes(session: SessionDep) -> list[Venda]:
    """Todas as vendas 'esteve em atraso' (ver acima) -- inclui quem
    já pagou. Usado SÓ pelo card/gráfico (visão histórica/contábil),
    agrupado por data_pagamento_vale. NÃO usar pra tabela/PDF de
    cobrança -- ver _vendas_em_atraso_atual() pra isso.

    Só busca candidatas com forma_pagamento='vale' no banco (o resto
    do filtro é em Python, já que a condição de data não dá pra
    expressar de forma portável entre SQLite/Postgres com
    func.julianday/func.date -- mesmo padrão Python-loop já usado no
    resto deste arquivo)."""
    hoje = date.today()
    candidatas = session.exec(
        select(Venda).where(Venda.forma_pagamento == "vale")
    ).all()
    return [v for v in candidatas if _esteve_em_atraso(v, hoje)]


def _vendas_em_atraso_atual(session: SessionDep) -> list[Venda]:
    """Só quem está em aberto E em atraso AGORA (pago_em IS NULL) --
    usado pela tabela de cobrança e pelo dropdown de motoristas (não
    faz sentido oferecer pra cobrar um motorista cujos clientes já
    quitaram tudo). Quem já pagou nunca aparece aqui, mesmo que tenha
    estado atrasado no passado (esse caso só aparece no card/gráfico,
    via _vendas_inadimplentes)."""
    return [v for v in _vendas_inadimplentes(session) if v.pago_em is None]


@router.get(
    "/inadimplentes/anos-disponiveis",
    response_model=AnosDisponiveisPublic,
    dependencies=[
        Depends(require_module_permission(MODULE_INADIMPLENCIA, action="read"))
    ],
)
def read_inadimplentes_anos_disponiveis(session: SessionDep) -> Any:
    """Até os 5 anos mais recentes de data_pagamento_vale entre as
    vendas 'esteve em atraso' (visão histórica -- inclui quem já
    pagou), em ordem decrescente -- monta os botões da linha 'Ano' do
    menu interativo, que dirige o card/gráfico."""
    vendas = _vendas_inadimplentes(session)
    anos = sorted(
        {v.data_pagamento_vale.year for v in vendas if v.data_pagamento_vale},
        reverse=True,
    )[:5]
    return AnosDisponiveisPublic(anos=anos)


@router.get(
    "/inadimplentes/motoristas",
    response_model=InadimplentesMotoristasPublic,
    dependencies=[
        Depends(require_module_permission(MODULE_INADIMPLENCIA, action="read"))
    ],
)
def read_inadimplentes_motoristas(session: SessionDep) -> Any:
    """Só os motoristas que têm ao menos 1 cliente em atraso AGORA
    (visão de cobrança, não histórica) -- monta o dropdown 'Nome
    Motorista' (a opção 'Todos Motoristas' é sintética, montada só no
    frontend). Inclui o usuário-sistema 'Distribuidora Gás Favero'
    normalmente, como qualquer outro motorista."""
    vendas = _vendas_em_atraso_atual(session)
    motorista_ids = {v.motorista_id for v in vendas}

    motoristas = []
    for motorista_id in motorista_ids:
        motorista = session.get(User, motorista_id)
        if motorista:
            motoristas.append(
                InadimplentesMotoristaPublic(
                    id=motorista.id,
                    nome=motorista.full_name or motorista.email,
                )
            )
    motoristas.sort(key=lambda m: m.nome.lower())
    return InadimplentesMotoristasPublic(data=motoristas)


@router.get(
    "/inadimplentes/resumo",
    response_model=InadimplentesResumoPublic,
    dependencies=[
        Depends(require_module_permission(MODULE_INADIMPLENCIA, action="read"))
    ],
)
def read_inadimplentes_resumo(
    session: SessionDep,
    escopo: Literal["todos_anos", "ano", "mes"] = "mes",
    ano: int | None = None,
    mes: int | None = None,
) -> Any:
    """O único card da tela ('Atraso maior que 30 dias') + o gráfico
    -- visão HISTÓRICA (inclui quem já pagou depois de atrasar), SEM
    linha de Semana no menu (diferente do Livro de Vendas), agrupado
    por data_pagamento_vale (quando o vale venceu)."""
    hoje = date.today()
    vendas = _vendas_inadimplentes(session)

    if escopo == "mes":
        ano_efetivo = ano or hoje.year
        mes_efetivo = mes or hoje.month
        if not (1 <= mes_efetivo <= 12):
            raise HTTPException(status_code=400, detail="Mês inválido")

        ultimo_dia = calendar.monthrange(ano_efetivo, mes_efetivo)[1]
        periodo_inicio = date(ano_efetivo, mes_efetivo, 1)
        periodo_fim = date(ano_efetivo, mes_efetivo, ultimo_dia)
        buckets_def = [
            (_label_bucket_semana(ini, fim), ini, fim)
            for ini, fim in _semanas_do_mes(ano_efetivo, mes_efetivo)
        ]

    elif escopo == "ano":
        if ano is None:
            raise HTTPException(status_code=400, detail="Informe o ano")
        periodo_inicio = date(ano, 1, 1)
        periodo_fim = date(ano, 12, 31)
        buckets_def = [
            (
                MESES_ABREV[m - 1],
                date(ano, m, 1),
                date(ano, m, calendar.monthrange(ano, m)[1]),
            )
            for m in range(1, 13)
        ]

    else:  # todos_anos -- intervalo de anos com data_pagamento_vale
        # presente entre as vendas inadimplentes (pode incluir anos
        # futuros, já que vencimento nem sempre já passou)
        datas_pagamento = [
            v.data_pagamento_vale for v in vendas if v.data_pagamento_vale
        ]
        if datas_pagamento:
            ano_inicio = min(d.year for d in datas_pagamento)
            ano_fim = max(d.year for d in datas_pagamento)
        else:
            ano_inicio = ano_fim = hoje.year
        periodo_inicio = date(ano_inicio, 1, 1)
        periodo_fim = date(ano_fim, 12, 31)
        buckets_def = [
            (str(a), date(a, 1, 1), date(a, 12, 31))
            for a in range(ano_inicio, ano_fim + 1)
        ]

    vendas_periodo = [
        v
        for v in vendas
        if v.data_pagamento_vale
        and periodo_inicio <= v.data_pagamento_vale <= periodo_fim
    ]

    grafico = []
    for label, bucket_inicio, bucket_fim in buckets_def:
        valor_bucket = sum(
            (
                v.valor_total
                for v in vendas_periodo
                if bucket_inicio <= v.data_pagamento_vale <= bucket_fim
            ),
            Decimal("0"),
        )
        grafico.append(LivroVendasBucket(label=label, valor=valor_bucket))

    return InadimplentesResumoPublic(
        qtd=len(vendas_periodo),
        valor=sum((v.valor_total for v in vendas_periodo), Decimal("0")),
        periodo_inicio=periodo_inicio,
        periodo_fim=periodo_fim,
        grafico=grafico,
    )


@router.get(
    "/inadimplentes",
    response_model=LivroVendasListPublic,
    dependencies=[
        Depends(require_module_permission(MODULE_INADIMPLENCIA, action="read"))
    ],
)
def read_inadimplentes(
    session: SessionDep,
    motorista_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 20,
) -> Any:
    """Tabela de cobrança -- só quem está em aberto E em atraso AGORA
    (visão atual, não histórica -- quem já pagou não aparece aqui,
    mesmo que tenha estado atrasado no passado), sem filtro de período
    (independente do menu Ano/Mês do topo da tela), ordenada por
    data_venda mais ANTIGA primeiro. motorista_id opcional filtra pra
    um motorista só ('Todos Motoristas', no frontend, simplesmente
    omite o parâmetro) -- é o que alimenta o PDF de cobrança de cada
    motorista.

    soma_preco/soma_valor_pago somam TODO o conjunto filtrado (não só
    a página atual), igual ao Livro de Vendas."""
    vendas = _vendas_em_atraso_atual(session)
    if motorista_id is not None:
        vendas = [v for v in vendas if v.motorista_id == motorista_id]

    vendas.sort(key=lambda v: (v.data_venda, v.created_at))

    count = len(vendas)
    soma_preco = sum((v.valor_total for v in vendas), Decimal("0"))
    soma_valor_pago = sum((v.valor_pago for v in vendas), Decimal("0"))
    pagina = vendas[skip : skip + limit]

    return LivroVendasListPublic(
        data=[_to_venda_public(session, v) for v in pagina],
        count=count,
        soma_preco=soma_preco,
        soma_valor_pago=soma_valor_pago,
    )


@router.get(
    "/{id}",
    response_model=VendaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_venda(session: SessionDep, id: uuid.UUID) -> Any:
    venda = session.get(Venda, id)
    if not venda:
        raise HTTPException(status_code=404, detail="Venda não encontrada")
    return _to_venda_public(session, venda)


@router.post(
    "/",
    response_model=VendaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="create"))],
)
def create_venda(
    *, session: SessionDep, current_user: CurrentUser, venda_in: VendaCreate
) -> Any:
    cliente = session.get(Cliente, venda_in.cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    motorista = session.get(User, venda_in.motorista_id)
    if not motorista:
        raise HTTPException(status_code=404, detail="Motorista não encontrado")

    if venda_in.endereco_id is not None:
        if not session.get(Endereco, venda_in.endereco_id):
            raise HTTPException(status_code=404, detail="Endereço não encontrado")

    # -----------------------------------------------------------
    # Forma de pagamento = vale: resolve o número, valida reuso,
    # valida DONO do vale (decisão confirmada com o Ricardo, achado
    # revisando o Recebimento de Vale: sem essa trava, dava pra
    # vender com o número de vale de OUTRO motorista) e bloqueia se
    # o cliente já tiver vale em aberto
    # -----------------------------------------------------------
    vale = None
    data_pagamento_vale = venda_in.data_pagamento_vale
    pago_em: Any = get_datetime_utc()

    if venda_in.forma_pagamento == "vale":
        pago_em = None  # venda a prazo -- fica em aberto até a baixa

        if venda_in.vale_numero is None:
            raise HTTPException(
                status_code=400,
                detail="Informe o número do vale para pagamento a prazo",
            )

        vale = session.exec(
            select(Vale).where(Vale.numero == venda_in.vale_numero)
        ).first()
        if not vale:
            raise HTTPException(
                status_code=404,
                detail=f"Vale número {venda_in.vale_numero} não encontrado",
            )

        # O vale só pode ser usado numa venda atribuída ao MESMO
        # motorista dono do bloco de onde ele veio -- sem isso seria
        # possível "gastar" o talão de um motorista numa venda
        # atribuída a outro (ou à Distribuidora).
        bloco = session.get(BlocoVale, vale.bloco_id)
        if not bloco or bloco.motorista_id != venda_in.motorista_id:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"O vale {venda_in.vale_numero} pertence ao bloco de outro "
                    "motorista -- selecione o motorista dono desse bloco, ou "
                    "use um número de vale do bloco atribuído ao motorista "
                    "escolhido"
                ),
            )

        ja_usado = session.exec(
            select(Venda).where(Venda.vale_id == vale.id)
        ).first()
        if ja_usado:
            raise HTTPException(
                status_code=400,
                detail=f"O vale {venda_in.vale_numero} já foi usado em outra venda",
            )

        vale_em_aberto = session.exec(
            select(Venda)
            .where(Venda.cliente_id == venda_in.cliente_id)
            .where(Venda.forma_pagamento == "vale")
            .where(col(Venda.pago_em).is_(None))
        ).first()
        if vale_em_aberto:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Este cliente já tem uma venda a prazo (vale) em aberto -- "
                    "não é possível vender fiado de novo até quitar"
                ),
            )

        if data_pagamento_vale is None:
            data_pagamento_vale = _quinto_dia_util_proximo_mes()

    # -----------------------------------------------------------
    # Itens da sacola: valida produto + preço vigente, calcula total
    # -----------------------------------------------------------
    if not venda_in.itens:
        raise HTTPException(status_code=400, detail="A venda precisa ter ao menos 1 item")

    itens_resolvidos = []
    valor_total = 0
    for item_in in venda_in.itens:
        produto = session.get(Item, item_in.produto_id)
        if not produto:
            raise HTTPException(
                status_code=404, detail=f"Produto {item_in.produto_id} não encontrado"
            )
        preco = _preco_vigente(session, item_in.produto_id)
        if not preco:
            raise HTTPException(
                status_code=400,
                detail=f"Produto '{produto.title}' ainda não tem preço cadastrado",
            )
        subtotal = preco.valor * item_in.quantidade
        valor_total += subtotal
        itens_resolvidos.append((item_in, preco, subtotal))

    venda = Venda(
        cliente_id=venda_in.cliente_id,
        endereco_id=venda_in.endereco_id,
        motorista_id=venda_in.motorista_id,
        forma_pagamento=venda_in.forma_pagamento,
        vale_id=vale.id if vale else None,
        data_pagamento_vale=data_pagamento_vale,
        valor_total=valor_total,
        valor_pago=venda_in.valor_pago,
        data_venda=venda_in.data_venda or date.today(),
        pago_em=pago_em,
        criado_por_id=current_user.id,
    )
    session.add(venda)
    session.flush()

    for item_in, preco, subtotal in itens_resolvidos:
        session.add(
            VendaItem(
                venda_id=venda.id,
                produto_id=item_in.produto_id,
                preco_id=preco.id,
                quantidade=item_in.quantidade,
                subtotal=subtotal,
            )
        )

    session.commit()
    session.refresh(venda)
    return _to_venda_public(session, venda)
