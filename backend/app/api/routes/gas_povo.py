# [mcp-local harness] feature: gas-povo | plano: 8ec9cbb7 | 2026-09-06 00:06:41
# Rotas de recebimento do Gas do Povo: lista pendentes e baixa individual
"""
Rotas do modulo Gas do Povo. Controle de acesso via modulo RBAC "gas_povo".

Fluxo:
  1. Venda criada com forma_pagamento="gas_povo"
     - gas_povo_frete_recebido_em preenchido automaticamente (frete pago pelo cliente no ato)
     - pago_em = None (governo paga depois)
  2. Quando o governo deposita, o Giovani acessa esta tela e da baixa
     - PATCH /gas-povo/recebimento/{venda_id}/marcar-recebido
     - preenche pago_em = now()
"""
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, select

from app.api.deps import CurrentUser, SessionDep, require_module_permission
from app.models import (
    Cliente,
    GasPovoRecebimentoPublic,
    GasPovoVendaPublic,
    User,
    Venda,
    VendaPublic,
    get_datetime_utc,
)
from app.api.routes.vendas import _to_venda_public

router = APIRouter(prefix="/gas-povo", tags=["gas_povo"])

MODULE = "gas_povo"


def _limites_mes_vigente(hoje: date) -> tuple[date, date]:
    primeiro = hoje.replace(day=1)
    if hoje.month == 12:
        proximo = date(hoje.year + 1, 1, 1)
    else:
        proximo = date(hoje.year, hoje.month + 1, 1)
    return primeiro, proximo


def _to_gas_povo_venda_public(session: SessionDep, venda: Venda) -> GasPovoVendaPublic:
    cliente = session.get(Cliente, venda.cliente_id)
    motorista = session.get(User, venda.motorista_id)
    hoje = date.today()
    dias = (hoje - venda.data_venda).days
    return GasPovoVendaPublic(
        id=venda.id,
        cliente_id=venda.cliente_id,
        cliente_nome=cliente.nome if cliente else "?",
        motorista_nome=(motorista.full_name or motorista.email) if motorista else "?",
        valor_total=venda.valor_total,
        gas_povo_frete=venda.gas_povo_frete or Decimal("0"),
        gas_povo_frete_recebido_em=venda.gas_povo_frete_recebido_em or datetime.now(UTC),
        data_venda=venda.data_venda,
        pago_em=venda.pago_em,
        dias_em_aberto=dias,
    )


@router.get("/recebimento", response_model=GasPovoRecebimentoPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))])
def read_recebimento_gas_povo(session: SessionDep) -> Any:
    hoje = date.today()
    primeiro_dia_mes, primeiro_dia_prox_mes = _limites_mes_vigente(hoje)

    pendentes = session.exec(
        select(Venda)
        .where(Venda.forma_pagamento == "gas_povo")
        .where(col(Venda.pago_em).is_(None))
        .order_by(Venda.data_venda)
    ).all()

    recebidos_mes = session.exec(
        select(Venda)
        .where(Venda.forma_pagamento == "gas_povo")
        .where(col(Venda.pago_em).is_not(None))
        .where(Venda.data_venda >= primeiro_dia_mes)
        .where(Venda.data_venda < primeiro_dia_prox_mes)
    ).all()

    pendentes_valor = sum((v.valor_total for v in pendentes), Decimal("0"))
    recebidos_mes_valor = sum((v.valor_total for v in recebidos_mes), Decimal("0"))

    return GasPovoRecebimentoPublic(
        pendentes=[_to_gas_povo_venda_public(session, v) for v in pendentes],
        pendentes_qtd=len(pendentes),
        pendentes_valor=pendentes_valor,
        recebidos_mes_qtd=len(recebidos_mes),
        recebidos_mes_valor=recebidos_mes_valor,
    )


@router.patch("/recebimento/{venda_id}/marcar-recebido", response_model=VendaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="update"))])
def marcar_gas_povo_recebido(
    *, session: SessionDep, current_user: CurrentUser, venda_id: uuid.UUID
) -> Any:
    venda = session.get(Venda, venda_id)
    if not venda:
        raise HTTPException(status_code=404, detail="Venda nao encontrada")
    if venda.forma_pagamento != "gas_povo":
        raise HTTPException(status_code=400, detail="Esta operacao e exclusiva para vendas Gas do Povo")
    if venda.pago_em is not None:
        raise HTTPException(status_code=400, detail="Esta venda ja foi marcada como recebida do governo")

    venda.pago_em = get_datetime_utc()
    session.add(venda)
    session.commit()
    session.refresh(venda)
    return _to_venda_public(session, venda)
