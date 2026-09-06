# [mcp-local harness] feature: venda-edicao | plano: ee66766a | 2026-09-06 00:54:21
# Adiciona endpoints editar_venda e cancelar_venda com log de auditoria e estorno contabil; atualiza _to_venda_public com status e logs; exclui canceladas dos totais
"""
Rotas de Venda (venda de balcao da distribuidora). Controle de acesso
via modulo RBAC "vendas".

Uma Venda e criada numa unica chamada (cabecalho + itens da "sacola"),
dentro de uma transacao: se qualquer item falhar (produto sem preco,
vale invalido, etc.) nada e gravado.

Preco de cada item vem da linha vigente de Preco no momento da venda
-- essa linha e imutavel (ver comentario em Preco, models.py), entao
reajustes futuros de preco nunca afetam vendas ja registradas.

Gas do Povo: forma_pagamento="gas_povo". O valor_total e o frete sao
informados manualmente (programa governamental, preco tabelado variavel).
O frete e pago pelo cliente no ato (gas_povo_frete_recebido_em preenchido
na criacao). O valor principal e liquidado pelo governo posteriormente
via tela "Recebimento Gas do Povo" (pago_em preenchido na baixa).

Edicao simples: PATCH /vendas/{id}/editar -- corrige forma de pagamento
(apenas formas simples: cartao/pix/dinheiro entre si), valor pago, data
da venda e motorista. Cada campo alterado gera uma linha em venda_log.
Fiado, Vale Gas e Gas do Povo requerem cancelar e refazer a venda.

Cancelamento: PATCH /vendas/{id}/cancelar -- marca a venda como cancelada
e lanca o estorno contabil (debito/credito invertidos do lancamento original).
A venda permanece visivel na tabela com badge "Cancelada".
"""
import calendar
import uuid
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Literal

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func as sa_func
from sqlalchemy import or_
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, require_module_permission
from app.models import (
    AnosDisponiveisPublic,
    Bairro,
    BlocoVale,
    BlocoValeGas,
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
    VendaEditarRequest,
    VendaItem,
    VendaItemPublic,
    VendaLog,
    VendaLogPublic,
    VendaMarcarPagoRequest,
    VendaPublic,
    VendasPublic,
    get_datetime_utc,
)

router = APIRouter(prefix="/vendas", tags=["vendas"])

MODULE = "vendas"
MODULE_LIVRO = "livro_vendas"
MODULE_INADIMPLENCIA = "inadimplencia"
DIAS_ATRASO_VALE = 30
FORMAS_PAGAMENTO_ORDEM = ["cartao_debito", "cartao_credito", "pix", "dinheiro", "vale", "vale_gas", "gas_povo"]

# Formas que podem ser trocadas entre si na edicao simples (sem campos auxiliares)
FORMAS_SIMPLES = {"cartao_debito", "cartao_credito", "pix", "dinheiro"}

# IDs fixos das contas contabeis (mesmo padrao do fechamento.py)
CONTA_MESTRE_ID     = "10000000-0000-0000-0000-000000000001"
CONTA_TRANSITO_ID   = "11000000-0000-0000-0000-000000000001"
CONTA_FIADO_ID      = "12000000-0000-0000-0000-000000000001"
CONTA_MAQUININHA_ID = "13000000-0000-0000-0000-000000000001"


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
    hoje = hoje or date.today()
    if hoje.month == 12:
        ano, mes = hoje.year + 1, 1
    else:
        ano, mes = hoje.year, hoje.month + 1
    ultimo_dia = calendar.monthrange(ano, mes)[1]
    d = date(ano, mes, 1)
    dias_uteis = 0
    while d.day <= ultimo_dia:
        if d.weekday() < 5:
            dias_uteis += 1
            if dias_uteis == 5:
                return d
        d += timedelta(days=1)
    return d


def _limites_mes_vigente(hoje: date) -> tuple[date, date]:
    primeiro = hoje.replace(day=1)
    if hoje.month == 12:
        proximo = date(hoje.year + 1, 1, 1)
    else:
        proximo = date(hoje.year, hoje.month + 1, 1)
    return primeiro, proximo


def _nome_usuario(user: User | None) -> str | None:
    if not user:
        return None
    return user.full_name or user.email


def _to_venda_public(session: SessionDep, venda: Venda) -> VendaPublic:
    cliente = session.get(Cliente, venda.cliente_id)
    motorista = session.get(User, venda.motorista_id)
    endereco = session.get(Endereco, venda.endereco_id) if venda.endereco_id else None
    vale = session.get(Vale, venda.vale_id) if venda.vale_id else None
    recebido_por = session.get(User, venda.recebido_por_id) if venda.recebido_por_id else None
    cancelada_por = session.get(User, venda.cancelada_por_id) if venda.cancelada_por_id else None

    # Nome do estabelecimento para vendas em Vale Gas
    vale_gas_estabelecimento: str | None = None
    if venda.vale_gas_bloco_id:
        bloco_gas = session.get(BlocoValeGas, venda.vale_gas_bloco_id)
        if bloco_gas:
            cliente_gas = session.get(Cliente, bloco_gas.cliente_id)
            if cliente_gas:
                vale_gas_estabelecimento = cliente_gas.nome

    itens = session.exec(select(VendaItem).where(VendaItem.venda_id == venda.id)).all()
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

    # Logs de edicao
    logs_db = session.exec(
        select(VendaLog).where(VendaLog.venda_id == venda.id).order_by(col(VendaLog.editado_em).desc())
    ).all()
    logs_public = []
    for log in logs_db:
        editor = session.get(User, log.editado_por_id) if log.editado_por_id else None
        logs_public.append(VendaLogPublic(
            id=log.id,
            campo=log.campo,
            valor_anterior=log.valor_anterior,
            valor_novo=log.valor_novo,
            editado_por_nome=_nome_usuario(editor),
            editado_em=log.editado_em,
        ))

    return VendaPublic(
        id=venda.id,
        cliente_id=venda.cliente_id,
        cliente_nome=cliente.nome if cliente else "?",
        endereco=_to_endereco_public(session, endereco) if endereco else None,
        motorista_id=venda.motorista_id,
        motorista_nome=_nome_usuario(motorista) or "?",
        forma_pagamento=venda.forma_pagamento,
        vale_numero=vale.numero if vale else None,
        data_pagamento_vale=venda.data_pagamento_vale,
        vale_gas_numero=venda.vale_gas_numero,
        vale_gas_estabelecimento=vale_gas_estabelecimento,
        gas_povo_frete=venda.gas_povo_frete,
        gas_povo_frete_recebido_em=venda.gas_povo_frete_recebido_em,
        valor_total=venda.valor_total,
        valor_pago=venda.valor_pago,
        data_venda=venda.data_venda,
        pago_em=venda.pago_em,
        recebido_em=venda.recebido_em,
        recebido_por_nome=_nome_usuario(recebido_por),
        status=venda.status,
        cancelada_em=venda.cancelada_em,
        cancelada_por_nome=_nome_usuario(cancelada_por),
        logs_edicao=logs_public,
        qtd_edicoes=len(logs_public),
        criado_por_id=venda.criado_por_id,
        created_at=venda.created_at,
        itens=itens_public,
    )


def _gravar_log_venda(session: SessionDep, venda_id: uuid.UUID, campo: str,
                      valor_anterior: str, valor_novo: str, editado_por_id: uuid.UUID) -> None:
    conn = session.connection()
    conn.execute(sa.text(
        "INSERT INTO venda_log (id, venda_id, campo, valor_anterior, valor_novo, editado_por_id, editado_em) "
        "VALUES (:id, :venda_id, :campo, :va, :vn, :ep, NOW())"
    ), {"id": str(uuid.uuid4()), "venda_id": str(venda_id), "campo": campo,
        "va": valor_anterior, "vn": valor_novo, "ep": str(editado_por_id)})


def _criar_lancamento_venda(session: SessionDep, data: date, descricao: str, valor: Decimal,
                            debito_id: str, credito_id: str, venda_id: uuid.UUID,
                            criado_por_id: uuid.UUID) -> None:
    conn = session.connection()
    conn.execute(sa.text(
        "INSERT INTO lancamento_contabil "
        "(id, data, descricao, valor, debito_id, credito_id, venda_id, criado_por_id, created_at) "
        "VALUES (:id, :data, :descricao, :valor, :debito_id, :credito_id, :venda_id, :criado_por_id, NOW())"
    ), {"id": str(uuid.uuid4()), "data": data, "descricao": descricao, "valor": valor,
        "debito_id": debito_id, "credito_id": credito_id,
        "venda_id": str(venda_id), "criado_por_id": str(criado_por_id)})


def _conta_motorista(session: SessionDep, motorista_id: uuid.UUID) -> str | None:
    """Retorna o ID da conta contabil do motorista (Caixa em Transito), se existir."""
    conn = session.connection()
    row = conn.execute(
        sa.text("SELECT id FROM conta WHERE motorista_id = :mid"),
        {"mid": str(motorista_id)}
    ).fetchone()
    return str(row[0]) if row else None


def _conta_por_forma(forma: str, motorista_id: uuid.UUID, session: SessionDep) -> tuple[str, str]:
    """
    Retorna (debito_id, credito_id) para o lancamento de uma venda conforme a forma de pagamento.
    Convencao: debito = quem recebe o dinheiro, credito = origem.
    """
    cmi = _conta_motorista(session, motorista_id) or CONTA_MESTRE_ID
    if forma in ("cartao_debito", "cartao_credito"):
        return CONTA_MAQUININHA_ID, cmi
    if forma == "vale":
        return CONTA_FIADO_ID, cmi
    # pix, dinheiro, vale_gas, gas_povo: entra no caixa mestre
    return CONTA_MESTRE_ID, cmi


# ---------------------------------------------------------------------------
# Rotas
# ---------------------------------------------------------------------------

@router.get("/", response_model=VendasPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))])
def read_vendas(session: SessionDep, skip: int = 0, limit: int = 100) -> Any:
    count = session.exec(select(func.count()).select_from(Venda)).one()
    vendas = session.exec(
        select(Venda).order_by(col(Venda.created_at).desc()).offset(skip).limit(limit)
    ).all()
    return VendasPublic(data=[_to_venda_public(session, v) for v in vendas], count=count)


@router.get("/cliente/{cliente_id}/ultimo-endereco", response_model=EnderecoPublic | None,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))])
def read_ultimo_endereco_cliente(session: SessionDep, cliente_id: uuid.UUID) -> Any:
    ultima = session.exec(
        select(Venda).where(Venda.cliente_id == cliente_id)
        .where(col(Venda.endereco_id).is_not(None))
        .order_by(col(Venda.created_at).desc())
    ).first()
    if not ultima:
        return None
    endereco = session.get(Endereco, ultima.endereco_id)
    return _to_endereco_public(session, endereco) if endereco else None


@router.get("/cliente/{cliente_id}/historico", response_model=VendasPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))])
def read_historico_vendas_cliente(session: SessionDep, cliente_id: uuid.UUID, limit: int = 3) -> Any:
    count = session.exec(select(func.count()).select_from(Venda).where(Venda.cliente_id == cliente_id)).one()
    vendas = session.exec(
        select(Venda).where(Venda.cliente_id == cliente_id)
        .order_by(col(Venda.created_at).desc()).limit(limit)
    ).all()
    return VendasPublic(data=[_to_venda_public(session, v) for v in vendas], count=count)


@router.get("/proximo-numero-vale/{motorista_id}", response_model=ProximoValeNumeroPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))])
def read_proximo_numero_vale(session: SessionDep, motorista_id: uuid.UUID) -> Any:
    blocos = session.exec(
        select(BlocoVale).where(BlocoVale.motorista_id == motorista_id).order_by(BlocoVale.created_at)
    ).all()
    usados_subquery = select(Venda.vale_id).where(col(Venda.vale_id).is_not(None))
    for bloco in blocos:
        vale_livre = session.exec(
            select(Vale).where(Vale.bloco_id == bloco.id)
            .where(col(Vale.id).not_in(usados_subquery)).order_by(Vale.numero)
        ).first()
        if vale_livre:
            return ProximoValeNumeroPublic(numero=vale_livre.numero)
    return ProximoValeNumeroPublic(numero=None)


# ---------------------------------------------------------------------------
# Recebimento de Vale (fiado)
# ---------------------------------------------------------------------------

def _query_base_vale_pendente(*, status: Literal["aberto", "aguardando_baixa"]):
    query = select(Venda).where(Venda.forma_pagamento == "vale").where(col(Venda.pago_em).is_(None))
    if status == "aberto":
        return query.where(col(Venda.recebido_em).is_(None))
    return query.where(col(Venda.recebido_em).is_not(None))


@router.get("/vales-recebimento/resumo", response_model=ResumoRecebimentoValePublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))])
def read_resumo_recebimento_vale(session: SessionDep) -> Any:
    hoje = date.today()
    limite_atraso = hoje - timedelta(days=DIAS_ATRASO_VALE)
    primeiro_dia_mes, primeiro_dia_prox_mes = _limites_mes_vigente(hoje)

    em_aberto = session.exec(_query_base_vale_pendente(status="aberto")).all()
    aguardando_baixa = session.exec(_query_base_vale_pendente(status="aguardando_baixa")).all()
    atraso = [v for v in em_aberto if v.data_venda <= limite_atraso]
    pagos_mes = session.exec(
        select(Venda).where(Venda.forma_pagamento == "vale")
        .where(col(Venda.pago_em).is_not(None))
        .where(func.date(Venda.pago_em) >= primeiro_dia_mes)
        .where(func.date(Venda.pago_em) < primeiro_dia_prox_mes)
    ).all()

    soma_vt = lambda vs: sum((v.valor_total for v in vs), Decimal("0"))
    soma_vp = lambda vs: sum((v.valor_pago for v in vs), Decimal("0"))

    return ResumoRecebimentoValePublic(
        em_aberto_qtd=len(em_aberto), em_aberto_valor=soma_vt(em_aberto),
        atraso_qtd=len(atraso), atraso_valor=soma_vt(atraso),
        aguardando_baixa_qtd=len(aguardando_baixa), aguardando_baixa_valor=soma_vp(aguardando_baixa),
        pagos_mes_qtd=len(pagos_mes), pagos_mes_valor=soma_vp(pagos_mes),
    )


@router.get("/vales-recebimento", response_model=VendasPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))])
def read_vales_recebimento(
    session: SessionDep,
    status: Literal["todos", "aguardando_baixa"] = "todos",
    busca_numero: int | None = None,
    order_by: Literal["data_venda", "valor_total", "cliente"] = "data_venda",
    order_dir: Literal["asc", "desc"] = "desc",
    skip: int = 0, limit: int = 20,
) -> Any:
    query = select(Venda).where(Venda.forma_pagamento == "vale").where(col(Venda.pago_em).is_(None))
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
    query = query.order_by(order_col.desc() if order_dir == "desc" else order_col.asc())
    vendas = session.exec(query.offset(skip).limit(limit)).all()
    return VendasPublic(data=[_to_venda_public(session, v) for v in vendas], count=count)


def _validar_venda_vale_aberta(venda: Venda | None) -> Venda:
    if not venda:
        raise HTTPException(status_code=404, detail="Venda nao encontrada")
    if venda.forma_pagamento != "vale":
        raise HTTPException(status_code=400, detail="Essa operacao so vale pra vendas em vale")
    if venda.pago_em is not None:
        raise HTTPException(status_code=400, detail="Este vale ja foi baixado")
    return venda


@router.patch("/{id}/marcar-pago", response_model=VendaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="update"))])
def marcar_venda_pago(*, session: SessionDep, current_user: CurrentUser, id: uuid.UUID, body: VendaMarcarPagoRequest) -> Any:
    venda = _validar_venda_vale_aberta(session.get(Venda, id))
    if body.valor_pago < venda.valor_pago:
        raise HTTPException(status_code=400, detail="O valor pago nao pode ser menor que o ja registrado")
    if body.valor_pago > venda.valor_total:
        raise HTTPException(status_code=400, detail="O valor pago nao pode ser maior que o valor total da venda")
    venda.valor_pago = body.valor_pago
    venda.recebido_em = get_datetime_utc()
    venda.recebido_por_id = current_user.id
    session.add(venda)
    session.commit()
    session.refresh(venda)
    return _to_venda_public(session, venda)


@router.patch("/{id}/baixar-vale", response_model=VendaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="update"))])
def baixar_vale(*, session: SessionDep, id: uuid.UUID, body: VendaBaixarValeRequest) -> Any:
    venda = _validar_venda_vale_aberta(session.get(Venda, id))
    if venda.recebido_em is None:
        raise HTTPException(status_code=400, detail="E preciso marcar como pago antes de dar a baixa")
    valor_pago = body.valor_pago if body.valor_pago is not None else venda.valor_pago
    if valor_pago < venda.valor_pago:
        raise HTTPException(status_code=400, detail="O valor pago nao pode ser menor que o ja registrado")
    if valor_pago > venda.valor_total:
        raise HTTPException(status_code=400, detail="O valor pago nao pode ser maior que o valor total da venda")
    venda.valor_pago = valor_pago
    venda.pago_em = get_datetime_utc()
    session.add(venda)
    session.commit()
    session.refresh(venda)
    return _to_venda_public(session, venda)


# ---------------------------------------------------------------------------
# Edicao simples de venda
# ---------------------------------------------------------------------------

@router.patch("/{id}/editar", response_model=VendaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="update"))])
def editar_venda(*, session: SessionDep, current_user: CurrentUser, id: uuid.UUID, body: VendaEditarRequest) -> Any:
    """
    Edicao simples de venda. Campos editaveis: forma_pagamento (apenas formas simples),
    valor_pago, data_venda, motorista_id. Cada campo alterado gera uma linha em venda_log.
    Vendas canceladas nao podem ser editadas.
    """
    venda = session.get(Venda, id)
    if not venda:
        raise HTTPException(status_code=404, detail="Venda nao encontrada")
    if venda.status == "cancelada":
        raise HTTPException(status_code=400, detail="Venda cancelada nao pode ser editada")

    houve_alteracao = False
    editor_id = current_user.id

    # Forma de pagamento
    if body.forma_pagamento is not None and body.forma_pagamento != venda.forma_pagamento:
        # Apenas formas simples podem ser trocadas entre si
        nova_forma = body.forma_pagamento
        forma_atual = venda.forma_pagamento
        if nova_forma not in FORMAS_SIMPLES or forma_atual not in FORMAS_SIMPLES:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Alteracao de forma de pagamento so e permitida entre formas simples "
                    "(Debito, Credito, Pix, Dinheiro). Para Fiado, Vale Gas ou Gas do Povo, "
                    "cancele esta venda e registre uma nova."
                )
            )
        _gravar_log_venda(session, venda.id, "forma_pagamento", forma_atual, nova_forma, editor_id)
        venda.forma_pagamento = nova_forma
        houve_alteracao = True

    # Valor pago
    if body.valor_pago is not None and body.valor_pago != venda.valor_pago:
        _gravar_log_venda(session, venda.id, "valor_pago",
                          f"R$ {venda.valor_pago:,.2f}", f"R$ {body.valor_pago:,.2f}", editor_id)
        venda.valor_pago = body.valor_pago
        houve_alteracao = True

    # Data da venda
    if body.data_venda is not None and body.data_venda != venda.data_venda:
        _gravar_log_venda(session, venda.id, "data_venda",
                          venda.data_venda.isoformat(), body.data_venda.isoformat(), editor_id)
        venda.data_venda = body.data_venda
        houve_alteracao = True

    # Motorista
    if body.motorista_id is not None and body.motorista_id != venda.motorista_id:
        motorista_novo = session.get(User, body.motorista_id)
        if not motorista_novo:
            raise HTTPException(status_code=404, detail="Motorista nao encontrado")
        motorista_anterior = session.get(User, venda.motorista_id)
        _gravar_log_venda(session, venda.id, "motorista_id",
                          _nome_usuario(motorista_anterior) or str(venda.motorista_id),
                          _nome_usuario(motorista_novo) or str(body.motorista_id), editor_id)
        venda.motorista_id = body.motorista_id
        houve_alteracao = True

    if not houve_alteracao:
        raise HTTPException(status_code=400, detail="Nenhuma alteracao detectada")

    session.add(venda)
    session.commit()
    session.refresh(venda)
    return _to_venda_public(session, venda)


# ---------------------------------------------------------------------------
# Cancelamento de venda + estorno contabil
# ---------------------------------------------------------------------------

@router.patch("/{id}/cancelar", response_model=VendaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="update"))])
def cancelar_venda(*, session: SessionDep, current_user: CurrentUser, id: uuid.UUID) -> Any:
    """
    Cancela uma venda e lanca o estorno contabil (debito/credito invertidos do lancamento original).
    A venda permanece visivel na tabela com status='cancelada' e badge vermelho.
    """
    venda = session.get(Venda, id)
    if not venda:
        raise HTTPException(status_code=404, detail="Venda nao encontrada")
    if venda.status == "cancelada":
        raise HTTPException(status_code=400, detail="Esta venda ja esta cancelada")

    # Lanca estorno contabil (debito/credito invertidos)
    # Busca o lancamento original desta venda
    conn = session.connection()
    lancamento_original = conn.execute(sa.text(
        "SELECT debito_id, credito_id, valor FROM lancamento_contabil "
        "WHERE venda_id = :vid ORDER BY created_at LIMIT 1"
    ), {"vid": str(venda.id)}).fetchone()

    if lancamento_original:
        # Estorno: inverte debito e credito
        _criar_lancamento_venda(
            session,
            data=date.today(),
            descricao=f"Estorno de venda cancelada - {venda.cliente_id}",
            valor=Decimal(str(lancamento_original[2])),
            debito_id=str(lancamento_original[1]),   # credito original vira debito
            credito_id=str(lancamento_original[0]),  # debito original vira credito
            venda_id=venda.id,
            criado_por_id=current_user.id,
        )

    # Marca como cancelada
    venda.status = "cancelada"
    venda.cancelada_em = get_datetime_utc()
    venda.cancelada_por_id = current_user.id

    # Log de auditoria
    _gravar_log_venda(session, venda.id, "status", "ativa", "cancelada", current_user.id)

    session.add(venda)
    session.commit()
    session.refresh(venda)
    return _to_venda_public(session, venda)


# ---------------------------------------------------------------------------
# Livro de Vendas
# ---------------------------------------------------------------------------

NOMES_DIA_SEMANA = ["Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"]
MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]


def _semana_atual(hoje: date | None = None) -> tuple[date, date]:
    hoje = hoje or date.today()
    dow_domingo_zero = (hoje.weekday() + 1) % 7
    inicio = hoje - timedelta(days=dow_domingo_zero)
    return inicio, inicio + timedelta(days=6)


def _semanas_do_mes(ano: int, mes: int) -> list[tuple[date, date]]:
    ultimo_dia = calendar.monthrange(ano, mes)[1]
    fim_mes = date(ano, mes, ultimo_dia)
    cursor = date(ano, mes, 1)
    buckets: list[tuple[date, date]] = []
    while cursor <= fim_mes:
        dow = (cursor.weekday() + 1) % 7
        fim_bucket = min(cursor + timedelta(days=6 - dow), fim_mes)
        buckets.append((cursor, fim_bucket))
        cursor = fim_bucket + timedelta(days=1)
    return buckets


def _label_bucket_semana(inicio: date, fim: date) -> str:
    return f"{inicio.day:02d}/{inicio.month:02d}-{fim.day:02d}/{fim.month:02d}"


@router.get("/livro/anos-disponiveis", response_model=AnosDisponiveisPublic,
    dependencies=[Depends(require_module_permission(MODULE_LIVRO, action="read"))])
def read_livro_anos_disponiveis(session: SessionDep) -> Any:
    datas = session.exec(select(Venda.data_venda)).all()
    return AnosDisponiveisPublic(anos=sorted({d.year for d in datas}, reverse=True)[:5])


@router.get("/livro/resumo", response_model=LivroVendasResumoPublic,
    dependencies=[Depends(require_module_permission(MODULE_LIVRO, action="read"))])
def read_livro_resumo(
    session: SessionDep,
    escopo: Literal["todos_anos", "ano", "mes", "semana"] = "mes",
    ano: int | None = None, mes: int | None = None,
) -> Any:
    hoje = date.today()
    if escopo == "semana":
        periodo_inicio, periodo_fim = _semana_atual(hoje)
        buckets_def = [
            (NOMES_DIA_SEMANA[i], periodo_inicio + timedelta(days=i), periodo_inicio + timedelta(days=i))
            for i in range(7)
        ]
    elif escopo == "mes":
        ano_efetivo = ano or hoje.year
        mes_efetivo = mes or hoje.month
        if not (1 <= mes_efetivo <= 12):
            raise HTTPException(status_code=400, detail="Mes invalido")
        ultimo_dia = calendar.monthrange(ano_efetivo, mes_efetivo)[1]
        periodo_inicio = date(ano_efetivo, mes_efetivo, 1)
        periodo_fim = date(ano_efetivo, mes_efetivo, ultimo_dia)
        buckets_def = [(_label_bucket_semana(i, f), i, f) for i, f in _semanas_do_mes(ano_efetivo, mes_efetivo)]
    elif escopo == "ano":
        if ano is None:
            raise HTTPException(status_code=400, detail="Informe o ano")
        periodo_inicio = date(ano, 1, 1)
        periodo_fim = date(ano, 12, 31)
        buckets_def = [
            (MESES_ABREV[m-1], date(ano, m, 1), date(ano, m, calendar.monthrange(ano, m)[1]))
            for m in range(1, 13)
        ]
    else:
        primeira = session.exec(select(func.min(Venda.data_venda))).one()
        ano_inicio = primeira.year if primeira else hoje.year
        periodo_inicio = date(ano_inicio, 1, 1)
        periodo_fim = date(hoje.year, 12, 31)
        buckets_def = [(str(a), date(a, 1, 1), date(a, 12, 31)) for a in range(ano_inicio, hoje.year + 1)]

    # Exclui vendas canceladas dos totais
    vendas_periodo = session.exec(
        select(Venda)
        .where(Venda.data_venda >= periodo_inicio)
        .where(Venda.data_venda <= periodo_fim)
        .where(Venda.status != "cancelada")
    ).all()
    em_caixa = [v for v in vendas_periodo if v.pago_em is not None]
    em_aberto = [v for v in vendas_periodo if v.pago_em is None]

    grafico = [
        LivroVendasBucket(
            label=label,
            valor=sum((v.valor_pago for v in em_caixa if bi <= v.data_venda <= bf), Decimal("0"))
        )
        for label, bi, bf in buckets_def
    ]
    em_caixa_por_forma = [
        LivroVendasFormaPagamentoValor(
            forma_pagamento=forma,
            valor=sum((v.valor_pago for v in em_caixa if v.forma_pagamento == forma), Decimal("0"))
        )
        for forma in FORMAS_PAGAMENTO_ORDEM
    ]
    return LivroVendasResumoPublic(
        em_caixa_qtd=len(em_caixa),
        em_caixa_valor=sum((v.valor_pago for v in em_caixa), Decimal("0")),
        em_caixa_por_forma_pagamento=em_caixa_por_forma,
        em_aberto_qtd=len(em_aberto),
        em_aberto_valor=sum((v.valor_total for v in em_aberto), Decimal("0")),
        periodo_inicio=periodo_inicio, periodo_fim=periodo_fim, grafico=grafico,
    )


@router.get("/livro", response_model=LivroVendasListPublic,
    dependencies=[Depends(require_module_permission(MODULE_LIVRO, action="read"))])
def read_livro_vendas(
    session: SessionDep,
    data_inicio: date | None = None, data_fim: date | None = None,
    status: Literal["todos", "pago", "em_aberto", "em_atraso"] = "todos",
    skip: int = 0, limit: int = 20,
) -> Any:
    limite_atraso = date.today() - timedelta(days=DIAS_ATRASO_VALE)

    def _filtros(stmt):
        if data_inicio:
            stmt = stmt.where(Venda.data_venda >= data_inicio)
        if data_fim:
            stmt = stmt.where(Venda.data_venda <= data_fim)
        if status == "pago":
            stmt = stmt.where(col(Venda.pago_em).is_not(None))
        elif status == "em_aberto":
            stmt = stmt.where(col(Venda.pago_em).is_(None)).where(
                or_(Venda.forma_pagamento != "vale", Venda.data_venda > limite_atraso)
            )
        elif status == "em_atraso":
            stmt = stmt.where(col(Venda.pago_em).is_(None)).where(Venda.forma_pagamento == "vale").where(Venda.data_venda <= limite_atraso)
        return stmt

    count = session.exec(_filtros(select(func.count()).select_from(Venda))).one()
    soma_preco, soma_valor_pago = session.exec(_filtros(
        select(func.coalesce(func.sum(Venda.valor_total), 0), func.coalesce(func.sum(Venda.valor_pago), 0))
    )).one()
    vendas = session.exec(
        _filtros(select(Venda)).order_by(col(Venda.data_venda).desc(), col(Venda.created_at).desc()).offset(skip).limit(limit)
    ).all()
    return LivroVendasListPublic(
        data=[_to_venda_public(session, v) for v in vendas],
        count=count, soma_preco=soma_preco, soma_valor_pago=soma_valor_pago,
    )


# ---------------------------------------------------------------------------
# Ranking da Semana
# ---------------------------------------------------------------------------

@router.get("/ranking-semana", response_model=RankingSemanaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))])
def read_ranking_semana(session: SessionDep) -> Any:
    periodo_inicio, periodo_fim = _semana_atual()
    vendas_periodo = session.exec(
        select(Venda)
        .where(Venda.data_venda >= periodo_inicio)
        .where(Venda.data_venda <= periodo_fim)
        .where(Venda.status != "cancelada")
    ).all()
    contagem: dict[uuid.UUID, int] = {}
    for v in vendas_periodo:
        contagem[v.motorista_id] = contagem.get(v.motorista_id, 0) + 1
    role_motorista = session.exec(select(Role).where(sa_func.lower(Role.name) == "motorista")).first()
    ranking: list[RankingMotoristaPublic] = []
    if role_motorista:
        motorista_ids = session.exec(select(UserRole.user_id).where(UserRole.role_id == role_motorista.id)).all()
        for mid in motorista_ids:
            m = session.get(User, mid)
            if m:
                ranking.append(RankingMotoristaPublic(motorista_id=mid, motorista_nome=m.full_name or m.email, quantidade=contagem.get(mid, 0)))
    ranking.sort(key=lambda r: r.motorista_nome.lower())
    ranking.sort(key=lambda r: r.quantidade, reverse=True)
    return RankingSemanaPublic(periodo_inicio=periodo_inicio, periodo_fim=periodo_fim, motoristas=ranking[:3])


# ---------------------------------------------------------------------------
# Inadimplentes
# ---------------------------------------------------------------------------

def _esteve_em_atraso(venda: Venda, hoje: date) -> bool:
    if venda.forma_pagamento != "vale":
        return False
    if venda.pago_em is not None:
        return (venda.pago_em.date() - venda.data_venda).days >= DIAS_ATRASO_VALE
    return (hoje - venda.data_venda).days >= DIAS_ATRASO_VALE


def _vendas_inadimplentes(session: SessionDep) -> list[Venda]:
    hoje = date.today()
    return [v for v in session.exec(
        select(Venda).where(Venda.forma_pagamento == "vale").where(Venda.status != "cancelada")
    ).all() if _esteve_em_atraso(v, hoje)]


def _vendas_em_atraso_atual(session: SessionDep) -> list[Venda]:
    return [v for v in _vendas_inadimplentes(session) if v.pago_em is None]


@router.get("/inadimplentes/anos-disponiveis", response_model=AnosDisponiveisPublic,
    dependencies=[Depends(require_module_permission(MODULE_INADIMPLENCIA, action="read"))])
def read_inadimplentes_anos_disponiveis(session: SessionDep) -> Any:
    vendas = _vendas_inadimplentes(session)
    return AnosDisponiveisPublic(anos=sorted({v.data_pagamento_vale.year for v in vendas if v.data_pagamento_vale}, reverse=True)[:5])


@router.get("/inadimplentes/motoristas", response_model=InadimplentesMotoristasPublic,
    dependencies=[Depends(require_module_permission(MODULE_INADIMPLENCIA, action="read"))])
def read_inadimplentes_motoristas(session: SessionDep) -> Any:
    vendas = _vendas_em_atraso_atual(session)
    motoristas = []
    for mid in {v.motorista_id for v in vendas}:
        m = session.get(User, mid)
        if m:
            motoristas.append(InadimplentesMotoristaPublic(id=m.id, nome=m.full_name or m.email))
    motoristas.sort(key=lambda m: m.nome.lower())
    return InadimplentesMotoristasPublic(data=motoristas)


@router.get("/inadimplentes/resumo", response_model=InadimplentesResumoPublic,
    dependencies=[Depends(require_module_permission(MODULE_INADIMPLENCIA, action="read"))])
def read_inadimplentes_resumo(
    session: SessionDep,
    escopo: Literal["todos_anos", "ano", "mes"] = "mes",
    ano: int | None = None, mes: int | None = None,
) -> Any:
    hoje = date.today()
    vendas = _vendas_inadimplentes(session)
    if escopo == "mes":
        ae = ano or hoje.year; me = mes or hoje.month
        if not (1 <= me <= 12): raise HTTPException(status_code=400, detail="Mes invalido")
        ultimo = calendar.monthrange(ae, me)[1]
        periodo_inicio = date(ae, me, 1); periodo_fim = date(ae, me, ultimo)
        buckets_def = [(_label_bucket_semana(i, f), i, f) for i, f in _semanas_do_mes(ae, me)]
    elif escopo == "ano":
        if ano is None: raise HTTPException(status_code=400, detail="Informe o ano")
        periodo_inicio = date(ano, 1, 1); periodo_fim = date(ano, 12, 31)
        buckets_def = [(MESES_ABREV[m-1], date(ano,m,1), date(ano,m,calendar.monthrange(ano,m)[1])) for m in range(1,13)]
    else:
        datas = [v.data_pagamento_vale for v in vendas if v.data_pagamento_vale]
        ai = min(d.year for d in datas) if datas else hoje.year
        af = max(d.year for d in datas) if datas else hoje.year
        periodo_inicio = date(ai, 1, 1); periodo_fim = date(af, 12, 31)
        buckets_def = [(str(a), date(a,1,1), date(a,12,31)) for a in range(ai, af+1)]
    vendas_periodo = [v for v in vendas if v.data_pagamento_vale and periodo_inicio <= v.data_pagamento_vale <= periodo_fim]
    grafico = [
        LivroVendasBucket(label=label, valor=sum((v.valor_total for v in vendas_periodo if bi <= v.data_pagamento_vale <= bf), Decimal("0")))
        for label, bi, bf in buckets_def
    ]
    return InadimplentesResumoPublic(
        qtd=len(vendas_periodo),
        valor=sum((v.valor_total for v in vendas_periodo), Decimal("0")),
        periodo_inicio=periodo_inicio, periodo_fim=periodo_fim, grafico=grafico,
    )


@router.get("/inadimplentes", response_model=LivroVendasListPublic,
    dependencies=[Depends(require_module_permission(MODULE_INADIMPLENCIA, action="read"))])
def read_inadimplentes(session: SessionDep, motorista_id: uuid.UUID | None = None, skip: int = 0, limit: int = 20) -> Any:
    vendas = _vendas_em_atraso_atual(session)
    if motorista_id:
        vendas = [v for v in vendas if v.motorista_id == motorista_id]
    vendas.sort(key=lambda v: (v.data_venda, v.created_at))
    count = len(vendas)
    soma_preco = sum((v.valor_total for v in vendas), Decimal("0"))
    soma_valor_pago = sum((v.valor_pago for v in vendas), Decimal("0"))
    return LivroVendasListPublic(
        data=[_to_venda_public(session, v) for v in vendas[skip:skip+limit]],
        count=count, soma_preco=soma_preco, soma_valor_pago=soma_valor_pago,
    )


@router.get("/{id}", response_model=VendaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))])
def read_venda(session: SessionDep, id: uuid.UUID) -> Any:
    venda = session.get(Venda, id)
    if not venda:
        raise HTTPException(status_code=404, detail="Venda nao encontrada")
    return _to_venda_public(session, venda)


@router.post("/", response_model=VendaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="create"))])
def create_venda(*, session: SessionDep, current_user: CurrentUser, venda_in: VendaCreate) -> Any:
    cliente = session.get(Cliente, venda_in.cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente nao encontrado")
    motorista = session.get(User, venda_in.motorista_id)
    if not motorista:
        raise HTTPException(status_code=404, detail="Motorista nao encontrado")
    if venda_in.endereco_id and not session.get(Endereco, venda_in.endereco_id):
        raise HTTPException(status_code=404, detail="Endereco nao encontrado")

    vale = None
    data_pagamento_vale = venda_in.data_pagamento_vale
    vale_gas_bloco_id: uuid.UUID | None = None
    gas_povo_frete_recebido_em = None
    pago_em: Any = get_datetime_utc()

    # --- Fiado ---
    if venda_in.forma_pagamento == "vale":
        pago_em = None
        if venda_in.vale_numero is None:
            raise HTTPException(status_code=400, detail="Informe o numero do vale para pagamento a prazo")
        vale = session.exec(select(Vale).where(Vale.numero == venda_in.vale_numero)).first()
        if not vale:
            raise HTTPException(status_code=404, detail=f"Vale numero {venda_in.vale_numero} nao encontrado")
        bloco = session.get(BlocoVale, vale.bloco_id)
        if not bloco or bloco.motorista_id != venda_in.motorista_id:
            raise HTTPException(status_code=400, detail=f"O vale {venda_in.vale_numero} pertence ao bloco de outro motorista")
        if session.exec(select(Venda).where(Venda.vale_id == vale.id)).first():
            raise HTTPException(status_code=400, detail=f"O vale {venda_in.vale_numero} ja foi usado em outra venda")
        if session.exec(select(Venda).where(Venda.cliente_id == venda_in.cliente_id).where(Venda.forma_pagamento == "vale").where(col(Venda.pago_em).is_(None))).first():
            raise HTTPException(status_code=400, detail="Este cliente ja tem uma venda a prazo em aberto -- quite antes de vender novamente")
        if data_pagamento_vale is None:
            data_pagamento_vale = _quinto_dia_util_proximo_mes()

    # --- Vale Gas ---
    elif venda_in.forma_pagamento == "vale_gas":
        pago_em = None
        if venda_in.vale_gas_numero is None:
            raise HTTPException(status_code=400, detail="Informe o numero do vale gas")
        if venda_in.vale_gas_bloco_id is None:
            raise HTTPException(status_code=400, detail="Numero de vale gas invalido -- bloco nao encontrado")
        bloco_gas = session.get(BlocoValeGas, venda_in.vale_gas_bloco_id)
        if not bloco_gas:
            raise HTTPException(status_code=404, detail="Bloco de vale gas nao encontrado")
        num = venda_in.vale_gas_numero
        if not (bloco_gas.primeira_folha <= num <= bloco_gas.ultima_folha):
            raise HTTPException(status_code=400, detail=f"Numero {num} fora do intervalo do bloco ({bloco_gas.primeira_folha}-{bloco_gas.ultima_folha})")
        ja_usado = session.exec(
            select(Venda).where(Venda.forma_pagamento == "vale_gas").where(Venda.vale_gas_numero == num)
        ).first()
        if ja_usado:
            raise HTTPException(status_code=400, detail=f"O vale gas numero {num} ja foi usado em outra venda")
        vale_gas_bloco_id = bloco_gas.id

    # --- Gas do Povo ---
    elif venda_in.forma_pagamento == "gas_povo":
        pago_em = None
        if venda_in.gas_povo_frete is None:
            raise HTTPException(status_code=400, detail="Informe o valor do frete para vendas Gas do Povo")
        gas_povo_frete_recebido_em = get_datetime_utc()

    if not venda_in.itens:
        raise HTTPException(status_code=400, detail="A venda precisa ter ao menos 1 item")

    itens_resolvidos = []
    if venda_in.forma_pagamento == "gas_povo":
        valor_total = venda_in.valor_pago
        for item_in in venda_in.itens:
            produto = session.get(Item, item_in.produto_id)
            if not produto:
                raise HTTPException(status_code=404, detail=f"Produto {item_in.produto_id} nao encontrado")
            preco = _preco_vigente(session, item_in.produto_id)
            if not preco:
                raise HTTPException(status_code=400, detail=f"Produto '{produto.title}' ainda nao tem preco cadastrado")
            subtotal = preco.valor * item_in.quantidade
            itens_resolvidos.append((item_in, preco, subtotal))
    else:
        for item_in in venda_in.itens:
            produto = session.get(Item, item_in.produto_id)
            if not produto:
                raise HTTPException(status_code=404, detail=f"Produto {item_in.produto_id} nao encontrado")
            preco = _preco_vigente(session, item_in.produto_id)
            if not preco:
                raise HTTPException(status_code=400, detail=f"Produto '{produto.title}' ainda nao tem preco cadastrado")
            subtotal = preco.valor * item_in.quantidade
            valor_total = Decimal("0")
            itens_resolvidos.append((item_in, preco, subtotal))
        valor_total = sum(subtotal for _, _, subtotal in itens_resolvidos)

    venda = Venda(
        cliente_id=venda_in.cliente_id,
        endereco_id=venda_in.endereco_id,
        motorista_id=venda_in.motorista_id,
        forma_pagamento=venda_in.forma_pagamento,
        vale_id=vale.id if vale else None,
        data_pagamento_vale=data_pagamento_vale,
        vale_gas_numero=venda_in.vale_gas_numero if venda_in.forma_pagamento == "vale_gas" else None,
        vale_gas_bloco_id=vale_gas_bloco_id,
        gas_povo_frete=venda_in.gas_povo_frete if venda_in.forma_pagamento == "gas_povo" else None,
        gas_povo_frete_recebido_em=gas_povo_frete_recebido_em,
        valor_total=valor_total,
        valor_pago=venda_in.valor_pago,
        data_venda=venda_in.data_venda or date.today(),
        pago_em=pago_em,
        status="ativa",
        criado_por_id=current_user.id,
    )
    session.add(venda)
    session.flush()

    for item_in, preco, subtotal in itens_resolvidos:
        session.add(VendaItem(venda_id=venda.id, produto_id=item_in.produto_id, preco_id=preco.id, quantidade=item_in.quantidade, subtotal=subtotal))

    session.commit()
    session.refresh(venda)
    return _to_venda_public(session, venda)
