# [mcp-local harness] feature: vale-gas-busca-por-nome | plano: 44d20142 | 2026-09-05 21:22:38
# Busca de cliente por nome OU CNPJ/CPF no endpoint de Vale Gas
"""
Rotas de Bloco de Vale Gas. Controle de acesso via modulo RBAC "vale_gas".

Vale Gas e um talao impresso por grafica, associado a um estabelecimento
comercial (PJ -- supermercado, farmacia etc). O cliente PJ compra o
bloco e distribui as folhas para seus clientes, que as apresentam na
distribuidora para retirar gas.

Um cliente so pode ter um bloco ativo (unique cliente_id). A numeracao
e propria (separada dos blocos de fiado dos motoristas).
"""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, or_, select

from app.api.deps import SessionDep, require_module_permission
from app.models import BlocoValeGas, BlocoValeGasCreate, BlocoValeGasPublic, BlocosValeGasPublic, Cliente

router = APIRouter(prefix="/vale-gas", tags=["vale_gas"])

MODULE = "vale_gas"
MAX_FOLHAS_POR_BLOCO = 500


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
    """Busca cliente por nome OU CPF/CNPJ (parcial, case-insensitive).
    Parametro 'q' aceita qualquer um dos dois -- o backend decide
    automaticamente se parece com documento (so digitos) ou nome (texto)
    e aplica o filtro adequado; na duvida busca nos dois campos."""
    termo = q.strip()
    termo_doc = termo.replace(".", "").replace("-", "").replace("/", "")

    # Busca por nome (ilike) OU por CPF/CNPJ (contains nos digitos limpos)
    # ilike e case-insensitive no Postgres; contains usa LIKE internamente
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


@router.post(
    "/blocos",
    response_model=BlocoValeGasPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="create"))],
)
def create_bloco_vale_gas(*, session: SessionDep, bloco_in: BlocoValeGasCreate) -> Any:
    """Cria o bloco de vale gas associado a um estabelecimento PJ."""
    cliente = session.get(Cliente, bloco_in.cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente nao encontrado")

    if bloco_in.ultima_folha < bloco_in.primeira_folha:
        raise HTTPException(
            status_code=400,
            detail="A ultima folha deve ser maior ou igual a primeira folha",
        )

    n_folhas = bloco_in.ultima_folha - bloco_in.primeira_folha + 1
    if n_folhas > MAX_FOLHAS_POR_BLOCO:
        raise HTTPException(
            status_code=400,
            detail=f"Intervalo grande demais (maximo {MAX_FOLHAS_POR_BLOCO} folhas por bloco)",
        )

    existente = session.exec(
        select(BlocoValeGas).where(BlocoValeGas.cliente_id == bloco_in.cliente_id)
    ).first()
    if existente:
        raise HTTPException(
            status_code=400,
            detail=f"Este cliente ja possui um Bloco de Vale Gas (folhas {existente.primeira_folha}-{existente.ultima_folha})",
        )

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
