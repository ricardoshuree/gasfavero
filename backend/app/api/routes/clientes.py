# [mcp-local harness] feature: delegacao-venda-fase2-geocoding | plano: 0144c501 | 2026-08-06 20:16:18
# Chama geocode() automaticamente em _create_endereco (best-effort), inclui lat/lng em EnderecoPublic
"""
Rotas de Cliente + Endereço. Controle de acesso via módulo RBAC
"clientes".

Fluxo real (RF-01 do apanhado do Giovani): motorista cadastra cliente
já com o endereço junto (POST /clientes/ recebe os dois de uma vez,
mas endereço agora é opcional -- ver ClienteCreate). Trocar de
endereço depois é um endpoint separado (POST /clientes/{id}/endereco)
porque precisa FECHAR o histórico antigo (valid_to = agora), não é um
UPDATE simples -- ver ClienteEndereco em models.py.

Geocodificação (Fase 2 da Delegação de Venda): todo Endereco novo
tenta ser geocodificado automaticamente na criação (best-effort, ver
app/core/geocoding.py) -- falha silenciosa, nunca impede o cadastro
do cliente/endereço em si.
"""
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlmodel import col, func, select

from app.api.deps import SessionDep, require_module_permission
from app.core.geocoding import geocode
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

    # Geocodificação best-effort: se falhar por qualquer motivo (sem
    # API key, sem cota, endereço não encontrado, timeout), geocode()
    # retorna None e o endereço é criado normalmente com lat/lng nulos
    # -- nunca bloqueia o cadastro do cliente. Ver app/core/geocoding.py.
    coordenadas = geocode(rua_nome=rua.nome, numero=endereco_in.numero, bairro_nome=bairro.nome)

    endereco = Endereco(
        rua_id=rua.id,
        numero=endereco_in.numero,
        complemento=endereco_in.complemento,
        latitude=coordenadas[0] if coordenadas else None,
        longitude=coordenadas[1] if coordenadas else None,
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
        latitude=endereco.latitude,
        longitude=endereco.longitude,
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
        telefone=cliente.telefone,
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
    """Cria cliente (+ endereço e vínculo vigente, se endereço for
    informado) numa única transação. Endereço é opcional aqui -- quem
    exige endereço obrigatório é a tela /clientes (validação de
    frontend), não este endpoint."""
    existente = session.exec(
        select(Cliente).where(Cliente.cpf == cliente_in.cpf)
    ).first()
    if existente:
        raise HTTPException(
            status_code=400,
            detail=f"Já existe um cliente com o CPF '{cliente_in.cpf}'",
        )

    cliente = Cliente(
        nome=cliente_in.nome, cpf=cliente_in.cpf, telefone=cliente_in.telefone
    )
    session.add(cliente)
    session.flush()

    if cliente_in.endereco is not None:
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
    """Edita só nome/cpf/telefone. Pra trocar de endereço, ver
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
