# [mcp-local harness] feature: recebimento-vale-gas | plano: 907fbb05 | 2026-09-05 22:36:33
# Adiciona endpoints de Recebimento de Vale Gas: resumo por estabelecimento, folhas do painel lateral, marcar recebido folha a folha
"""
Rotas de Bloco de Vale Gas e Recebimento de Vale Gas.
Controle de acesso via modulo RBAC "vale_gas".

Vale Gas e um talao impresso por grafica, associado a um estabelecimento
comercial (PJ -- supermercado, farmacia etc). O cliente PJ compra o
bloco e distribui as folhas para seus clientes, que as apresentam na
distribuidora para retirar gas.

Recebimento de Vale Gas: Giovani visita o estabelecimento e recebe o
pagamento folha a folha. Cada folha e marcada individualmente como
recebida. Apos 60 dias da data de recebimento, a folha some do painel.
"""
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, or_, select

from app.api.deps import CurrentUser, SessionDep, require_module_permission
from app.models import (
    BlocoValeGas,
    BlocoValeGasCreate,
    BlocoValeGasPublic,
    BlocosValeGasPublic,
    Cliente,
    Venda,
    get_datetime_utc,
)

router = APIRouter(prefix="/vale-gas", tags=["vale_gas"])

MODULE = "vale_gas"
MAX_FOLHAS_POR_BLOCO = 500
# Dias apos recebimento que a folha permanece visivel no painel
DIAS_HISTORICO = 60


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _cliente_nome(cliente: Cliente | None) -> str:
    if not cliente:
        return "(cliente removido)"
    return cliente.nome


def _to_bloco_public(session: SessionDep, bloco: BlocoValeGas) -> BlocoValeGasPublic:
    cliente = session.get(Cliente, bloco.cliente_id)
    return BlocoValeGasPublic(
        id=bloco.id,
        cliente_id=bloco.cliente_id,
        cliente_nome=_cliente_nome(cliente),
        cliente_cpf=cliente.cpf if cliente else "",
        primeira_folha=bloco.primeira_folha,
        ultima_folha=bloco.ultima_folha,
        total_folhas=bloco.ultima_folha - bloco.primeira_folha + 1,
        data=bloco.data,
        created_at=bloco.created_at,
    )


def _vendas_do_bloco(session: SessionDep, bloco_id: uuid.UUID) -> list[Venda]:
    """Retorna todas as vendas vale_gas do bloco, dentro da janela de visibilidade:
    - pendentes (recebido_em IS NULL): sempre visiveis
    - recebidas (recebido_em IS NOT NULL): visiveis ate 60 dias apos recebimento
    """
    corte = datetime.now(UTC) - timedelta(days=DIAS_HISTORICO)
    return session.exec(
        select(Venda)
        .where(Venda.forma_pagamento == "vale_gas")
        .where(Venda.vale_gas_bloco_id == bloco_id)
        .where(
            or_(
                col(Venda.recebido_em).is_(None),
                Venda.recebido_em >= corte,
            )
        )
        .order_by(col(Venda.vale_gas_numero).desc())
    ).all()


def _dias_desde_venda(data_venda: date) -> int:
    return (date.today() - data_venda).days


# ---------------------------------------------------------------------------
# Blocos
# ---------------------------------------------------------------------------

@router.get(
    "/blocos",
    response_model=BlocosValeGasPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_blocos_vale_gas(session: SessionDep) -> Any:
    blocos = session.exec(
        select(BlocoValeGas).order_by(col(BlocoValeGas.created_at).desc())
    ).all()
    return BlocosValeGasPublic(data=[_to_bloco_public(session, b) for b in blocos])


@router.get(
    "/clientes/busca",
    response_model=list[dict],
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def buscar_cliente_vale_gas(q: str, session: SessionDep) -> Any:
    """Busca cliente por nome OU CPF/CNPJ (parcial, case-insensitive)."""
    termo = q.strip()
    termo_doc = termo.replace(".", "").replace("-", "").replace("/", "")
    clientes = session.exec(
        select(Cliente)
        .where(
            or_(
                col(Cliente.nome).ilike(f"%{termo}%"),
                col(Cliente.cpf).contains(termo_doc),
            )
        )
        .order_by(col(Cliente.nome))
        .limit(10)
    ).all()
    return [{"id": str(c.id), "nome": c.nome, "cpf": c.cpf} for c in clientes]


@router.get(
    "/validar-numero/{numero}",
    response_model=dict,
    dependencies=[Depends(require_module_permission("vendas", action="read"))],
)
def validar_numero_vale_gas(numero: int, session: SessionDep) -> Any:
    """Valida se um numero de folha pertence a algum bloco de vale gas."""
    bloco = session.exec(
        select(BlocoValeGas).where(
            BlocoValeGas.primeira_folha <= numero,
            BlocoValeGas.ultima_folha >= numero,
        )
    ).first()
    if not bloco:
        return {"valido": False, "estabelecimento_nome": None, "estabelecimento_cpf": None, "bloco_id": None}
    cliente = session.get(Cliente, bloco.cliente_id)
    return {
        "valido": True,
        "estabelecimento_nome": cliente.nome if cliente else "(removido)",
        "estabelecimento_cpf": cliente.cpf if cliente else "",
        "bloco_id": str(bloco.id),
    }


@router.post(
    "/blocos",
    response_model=BlocoValeGasPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="create"))],
)
def create_bloco_vale_gas(*, session: SessionDep, bloco_in: BlocoValeGasCreate) -> Any:
    cliente = session.get(Cliente, bloco_in.cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente nao encontrado")
    if bloco_in.ultima_folha < bloco_in.primeira_folha:
        raise HTTPException(status_code=400, detail="A ultima folha deve ser maior ou igual a primeira folha")
    if bloco_in.ultima_folha - bloco_in.primeira_folha + 1 > MAX_FOLHAS_POR_BLOCO:
        raise HTTPException(status_code=400, detail=f"Intervalo grande demais (maximo {MAX_FOLHAS_POR_BLOCO} folhas)")
    existente = session.exec(select(BlocoValeGas).where(BlocoValeGas.cliente_id == bloco_in.cliente_id)).first()
    if existente:
        raise HTTPException(status_code=400, detail=f"Este cliente ja possui um Bloco de Vale Gas (folhas {existente.primeira_folha}-{existente.ultima_folha})")
    bloco = BlocoValeGas(
        cliente_id=bloco_in.cliente_id,
        primeira_folha=bloco_in.primeira_folha,
        ultima_folha=bloco_in.ultima_folha,
        data=bloco_in.data,
    )
    session.add(bloco)
    session.commit()
    session.refresh(bloco)
    return _to_bloco_public(session, bloco)


# ---------------------------------------------------------------------------
# Recebimento de Vale Gas
# ---------------------------------------------------------------------------

@router.get(
    "/recebimento",
    response_model=list[dict],
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_recebimento_resumo(session: SessionDep) -> Any:
    """
    Lista todos os estabelecimentos com bloco de vale gas ativo,
    com resumo para o card da tela de Recebimento:

    - blocos: lista de (primeira_folha, ultima_folha, data) dos ultimos 3 blocos
    - vendidos_mes_qtd / vendidos_mes_valor: vendas vale_gas no mes vigente
    - pendente_baixa_qtd / pendente_baixa_valor: todas sem recebido_em
    """
    hoje = date.today()
    inicio_mes = hoje.replace(day=1)

    blocos = session.exec(
        select(BlocoValeGas).order_by(col(BlocoValeGas.created_at).desc())
    ).all()

    resultado = []
    for bloco in blocos:
        cliente = session.get(Cliente, bloco.cliente_id)

        # Vendas deste bloco no mes vigente
        vendas_mes = session.exec(
            select(Venda)
            .where(Venda.forma_pagamento == "vale_gas")
            .where(Venda.vale_gas_bloco_id == bloco.id)
            .where(Venda.data_venda >= inicio_mes)
        ).all()

        # Todas as pendentes de baixa (sem recebido_em)
        pendentes = session.exec(
            select(Venda)
            .where(Venda.forma_pagamento == "vale_gas")
            .where(Venda.vale_gas_bloco_id == bloco.id)
            .where(col(Venda.recebido_em).is_(None))
        ).all()

        resultado.append({
            "bloco_id": str(bloco.id),
            "cliente_nome": cliente.nome if cliente else "(removido)",
            "cliente_cpf": cliente.cpf if cliente else "",
            # Ultimos 3 blocos (hoje so tem 1 por cliente, mas estrutura suporta historico)
            "blocos_info": [
                {
                    "primeira_folha": bloco.primeira_folha,
                    "ultima_folha": bloco.ultima_folha,
                    "data": bloco.data.isoformat(),
                }
            ],
            "vendidos_mes_qtd": len(vendas_mes),
            "vendidos_mes_valor": str(sum((v.valor_total for v in vendas_mes), Decimal("0"))),
            "pendente_baixa_qtd": len(pendentes),
            "pendente_baixa_valor": str(sum((v.valor_total for v in pendentes), Decimal("0"))),
        })

    return resultado


@router.get(
    "/recebimento/{bloco_id}/folhas",
    response_model=list[dict],
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_folhas_bloco(bloco_id: uuid.UUID, session: SessionDep) -> Any:
    """
    Lista as folhas (vendas vale_gas) do bloco para o painel lateral.

    Retorna:
    - pendentes (recebido_em IS NULL): sempre visiveis
    - recebidas nos ultimos 60 dias: visiveis para historico/edicao
    - dias_desde_venda: contador de dias desde a venda (para alertas)
    - dias_desde_recebimento: contador a partir do recebimento (para esconder apos 60 dias)
    """
    bloco = session.get(BlocoValeGas, bloco_id)
    if not bloco:
        raise HTTPException(status_code=404, detail="Bloco nao encontrado")

    vendas = _vendas_do_bloco(session, bloco_id)
    hoje = date.today()

    folhas = []
    for v in vendas:
        dias_venda = (hoje - v.data_venda).days
        dias_recebimento = None
        if v.recebido_em:
            dias_recebimento = (datetime.now(UTC) - v.recebido_em).days

        folhas.append({
            "venda_id": str(v.id),
            "numero": v.vale_gas_numero,
            "data_venda": v.data_venda.isoformat(),
            "valor_total": str(v.valor_total),
            "recebido": v.recebido_em is not None,
            "recebido_em": v.recebido_em.isoformat() if v.recebido_em else None,
            "dias_desde_venda": dias_venda,
            "dias_desde_recebimento": dias_recebimento,
        })

    return folhas


@router.patch(
    "/recebimento/{venda_id}/marcar-recebido",
    response_model=dict,
    dependencies=[Depends(require_module_permission(MODULE, action="update"))],
)
def marcar_folha_recebida(
    venda_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Marca uma folha de vale gas como recebida (toggle: se ja recebida, desfaz).
    Folha a folha -- o Giovani pode quitar parcialmente numa visita.
    """
    venda = session.get(Venda, venda_id)
    if not venda:
        raise HTTPException(status_code=404, detail="Venda nao encontrada")
    if venda.forma_pagamento != "vale_gas":
        raise HTTPException(status_code=400, detail="Esta venda nao e de vale gas")

    # Toggle: se ja recebida desfaz (permite correcao dentro dos 60 dias)
    if venda.recebido_em is not None:
        venda.recebido_em = None
        venda.recebido_por_id = None
    else:
        venda.recebido_em = get_datetime_utc()
        venda.recebido_por_id = current_user.id

    session.add(venda)
    session.commit()
    session.refresh(venda)

    return {
        "venda_id": str(venda.id),
        "recebido": venda.recebido_em is not None,
        "recebido_em": venda.recebido_em.isoformat() if venda.recebido_em else None,
    }
