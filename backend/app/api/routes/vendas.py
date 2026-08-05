# [mcp-local harness] feature: fluxo-vendas-distribuidora | plano: 3f2bec12 | 2026-08-05 10:34:31
# Adiciona GET /vendas/cliente/{cliente_id}/ultimo-endereco (sugestao de endereco baseada no historico de vendas)
# [mcp-local harness] feature: fluxo-vendas-distribuidora | plano: 3f2bec12
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
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, require_module_permission
from app.models import (
    Bairro,
    Cidade,
    Cliente,
    Endereco,
    EnderecoPublic,
    Item,
    Preco,
    Rua,
    User,
    Vale,
    Venda,
    VendaCreate,
    VendaItem,
    VendaItemPublic,
    VendaPublic,
    VendasPublic,
    get_datetime_utc,
)

router = APIRouter(prefix="/vendas", tags=["vendas"])

MODULE = "vendas"


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


def _to_venda_public(session: SessionDep, venda: Venda) -> VendaPublic:
    cliente = session.get(Cliente, venda.cliente_id)
    motorista = session.get(User, venda.motorista_id)
    endereco = session.get(Endereco, venda.endereco_id) if venda.endereco_id else None
    vale = session.get(Vale, venda.vale_id) if venda.vale_id else None

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
    # Forma de pagamento = vale: resolve o número, valida reuso e
    # bloqueia se o cliente já tiver vale em aberto
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
