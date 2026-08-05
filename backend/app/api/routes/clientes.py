# [mcp-local harness] feature: clientes-precos-vales-e-module-label | plano: 7a1919ed | 2026-08-04 23:40:13
# Corrige import de or_ para vir de sqlalchemy diretamente (evita risco de ImportError)
# [mcp-local harness] feature: clientes-precos-vales-e-module-label | plano: 7a1919ed | 2026-08-04 23:25:56
# CRUD de Cliente + Endereco, com troca de endereco fechando o historico
# [mcp-local harness] feature: clientes-precos-vales-e-module-label | plano: 7a1919ed
#
# [mcp-local harness] fix: or_ importado de sqlalchemy (nao sqlmodel) --
# func/col ja sao confirmados via items.py, mas or_ nunca foi usado no
# projeto ainda; import direto da fonte evita risco de ImportError.
"""
Rotas de Cliente + Endereço. Controle de acesso via módulo RBAC
"clientes".

Fluxo real (RF-01 do apanhado do Giovani): motorista cadastra cliente
já com o endereço junto (POST /clientes/ recebe os dois de uma vez).
Trocar de endereço depois é um endpoint separado (POST
/clientes/{id}/endereco) porque precisa FECHAR o histórico antigo
(valid_to = agora), não é um UPDATE simples -- ver ClienteEndereco em
models.py.
"""
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlmodel import col, func, select

from app.api.deps import SessionDep, require_module_permission
from app.models import (
    Bairro,
    Cidade,
    Cliente,
    ClienteCreate,
    ClienteEndereco,
    ClientePublic,
    ClientesPublic,
    ClienteUpdate,
    Endereco,
    EnderecoCreate,
    EnderecoPublic,
    Rua,
    get_datetime_utc,
)

router = APIRouter(prefix="/clientes", tags=["clientes"])

MODULE = "clientes"


# ---------------------------------------------------------------------------
# Helpers internos
# ---------------------------------------------------------------------------

def _resolve_or_create_rua(session: SessionDep, bairro_id: uuid.UUID, nome: str) -> Rua:
    """Acha a Rua pelo nome (case-insensitive) dentro do bairro, ou
    cria na hora -- é o mecanismo "cresce por uso" do catálogo de
    ruas."""
    nome_limpo = nome.strip()
    existente = session.exec(
        select(Rua)
        .where(Rua.bairro_id == bairro_id)
        .where(func.lower(Rua.nome) == nome_limpo.lower())
    ).first()
    if existente:
        return existente

    rua = Rua(bairro_id=bairro_id, nome=nome_limpo)
    session.add(rua)
    session.flush()
    return rua


def _create_endereco(session: SessionDep, endereco_in: EnderecoCreate) -> Endereco:
    bairro = session.get(Bairro, endereco_in.bairro_id)
    if not bairro:
        raise HTTPException(status_code=404, detail="Bairro não encontrado")

    rua = _resolve_or_create_rua(session, bairro.id, endereco_in.rua_nome)

    endereco = Endereco(
        rua_id=rua.id,
        numero=endereco_in.numero,
        complemento=endereco_in.complemento,
    )
    session.add(endereco)
    session.flush()
    return endereco


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


def _get_endereco_vigente(session: SessionDep, cliente_id: uuid.UUID) -> Endereco | None:
    ce = session.exec(
        select(ClienteEndereco)
        .where(ClienteEndereco.cliente_id == cliente_id)
        .where(col(ClienteEndereco.valid_to).is_(None))
    ).first()
    if not ce:
        return None
    return session.get(Endereco, ce.endereco_id)


def _to_cliente_public(session: SessionDep, cliente: Cliente) -> ClientePublic:
    endereco = _get_endereco_vigente(session, cliente.id)
    return ClientePublic(
        id=cliente.id,
        nome=cliente.nome,
        cpf=cliente.cpf,
        created_at=cliente.created_at,
        endereco=_to_endereco_public(session, endereco) if endereco else None,
    )


# ---------------------------------------------------------------------------
# Rotas
# ---------------------------------------------------------------------------

@router.get(
    "/",
    response_model=ClientesPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_clientes(
    session: SessionDep, q: str | None = None, skip: int = 0, limit: int = 100
) -> Any:
    """Lista clientes. `q` busca por nome OU cpf (case-insensitive,
    parcial) -- é a consulta que o motorista usa pra achar o cliente
    na hora da venda (RF-04)."""
    statement = select(Cliente)
    if q:
        like = f"%{q}%"
        statement = statement.where(
            or_(col(Cliente.nome).ilike(like), col(Cliente.cpf).ilike(like))
        )

    count = session.exec(
        select(func.count()).select_from(statement.subquery())
    ).one()
    clientes = session.exec(
        statement.order_by(Cliente.nome).offset(skip).limit(limit)
    ).all()

    return ClientesPublic(
        data=[_to_cliente_public(session, c) for c in clientes], count=count
    )


@router.post(
    "/",
    response_model=ClientePublic,
    dependencies=[Depends(require_module_permission(MODULE, action="create"))],
)
def create_cliente(*, session: SessionDep, cliente_in: ClienteCreate) -> Any:
    """Cria cliente + endereço + o vínculo vigente numa única
    transação."""
    existente = session.exec(
        select(Cliente).where(Cliente.cpf == cliente_in.cpf)
    ).first()
    if existente:
        raise HTTPException(
            status_code=400,
            detail=f"Já existe um cliente com o CPF '{cliente_in.cpf}'",
        )

    cliente = Cliente(nome=cliente_in.nome, cpf=cliente_in.cpf)
    session.add(cliente)
    session.flush()

    endereco = _create_endereco(session, cliente_in.endereco)
    session.add(
        ClienteEndereco(cliente_id=cliente.id, endereco_id=endereco.id)
    )

    session.commit()
    session.refresh(cliente)
    return _to_cliente_public(session, cliente)


@router.get(
    "/{id}",
    response_model=ClientePublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_cliente(session: SessionDep, id: uuid.UUID) -> Any:
    cliente = session.get(Cliente, id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return _to_cliente_public(session, cliente)


@router.patch(
    "/{id}",
    response_model=ClientePublic,
    dependencies=[Depends(require_module_permission(MODULE, action="update"))],
)
def update_cliente(
    *, session: SessionDep, id: uuid.UUID, cliente_in: ClienteUpdate
) -> Any:
    """Edita só nome/cpf. Pra trocar de endereço, ver
    POST /clientes/{id}/endereco."""
    cliente = session.get(Cliente, id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    if cliente_in.cpf and cliente_in.cpf != cliente.cpf:
        existente = session.exec(
            select(Cliente).where(Cliente.cpf == cliente_in.cpf)
        ).first()
        if existente:
            raise HTTPException(
                status_code=400,
                detail=f"Já existe um cliente com o CPF '{cliente_in.cpf}'",
            )

    update_data = cliente_in.model_dump(exclude_unset=True)
    cliente.sqlmodel_update(update_data)
    session.add(cliente)
    session.commit()
    session.refresh(cliente)
    return _to_cliente_public(session, cliente)


@router.post(
    "/{id}/endereco",
    response_model=ClientePublic,
    dependencies=[Depends(require_module_permission(MODULE, action="update"))],
)
def trocar_endereco(
    *, session: SessionDep, id: uuid.UUID, endereco_in: EnderecoCreate
) -> Any:
    """Registra um novo endereço vigente pro cliente, fechando o
    anterior (valid_to = agora) -- nunca edita o endereço antigo no
    lugar, é sempre um novo registro no histórico."""
    cliente = session.get(Cliente, id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    agora = get_datetime_utc()
    vigente = session.exec(
        select(ClienteEndereco)
        .where(ClienteEndereco.cliente_id == id)
        .where(col(ClienteEndereco.valid_to).is_(None))
    ).first()
    if vigente:
        vigente.valid_to = agora
        session.add(vigente)

    novo_endereco = _create_endereco(session, endereco_in)
    session.add(
        ClienteEndereco(
            cliente_id=id, endereco_id=novo_endereco.id, valid_from=agora
        )
    )

    session.commit()
    session.refresh(cliente)
    return _to_cliente_public(session, cliente)
