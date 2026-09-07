# [mcp-local harness] feature: emprestimo_casco | plano: 1c0b80ad | 2026-09-07 15:10:37
# Rotas CRUD do módulo cascos: listar, listar por cliente, receber devolução, confirmar baixa
"""
Rotas do modulo Cascos. Controle de acesso via modulo RBAC "cascos".

Fluxo de emprestimo e devolucao:
  1. Casco emprestado na venda -> POST /vendas/ com campo cascos[]
     - registros criados em emprestimo_casco com recebido_em=NULL
  2. Motorista ou gerente recebe casco fisicamente
     - PATCH /cascos/{id}/receber -> preenche recebido_em + recebido_por_id
     - status passa de "emprestado" para "recebido_aguardando"
  3. Gerente confirma e da baixa formal (dupla checagem)
     - PATCH /cascos/{id}/confirmar -> preenche confirmado_em + confirmado_por_id
     - status passa de "recebido_aguardando" para "devolvido"
"""
import uuid
from datetime import UTC, date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, select

from app.api.deps import CurrentUser, SessionDep, require_module_permission
from app.models import (
    Cliente,
    EmprestimoCasco,
    EmprestimoCascoConfirmarRequest,
    EmprestimoCascoPublic,
    EmprestimoCascoReceberRequest,
    EmprestimosCascoPublic,
    CascosClientePublic,
    Item,
    User,
    get_datetime_utc,
)

router = APIRouter(prefix="/cascos", tags=["cascos"])

MODULE = "cascos"


def _status_casco(c: EmprestimoCasco) -> str:
    if c.confirmado_em is not None:
        return "devolvido"
    if c.recebido_em is not None:
        return "recebido_aguardando"
    return "emprestado"


def _to_casco_public(session: SessionDep, c: EmprestimoCasco) -> EmprestimoCascoPublic:
    produto = session.get(Item, c.produto_id)
    cliente = session.get(Cliente, c.cliente_id)
    motorista = session.get(User, c.motorista_id) if c.motorista_id else None
    recebido_por = session.get(User, c.recebido_por_id) if c.recebido_por_id else None
    confirmado_por = session.get(User, c.confirmado_por_id) if c.confirmado_por_id else None

    hoje = date.today()
    dias = (hoje - c.created_at.date()).days if c.confirmado_em is None else 0

    return EmprestimoCascoPublic(
        id=c.id,
        venda_id=c.venda_id,
        produto_id=c.produto_id,
        produto_nome=produto.title if produto else "?",
        quantidade=c.quantidade,
        motorista_id=c.motorista_id,
        motorista_nome=(motorista.full_name or motorista.email) if motorista else None,
        cliente_id=c.cliente_id,
        cliente_nome=cliente.nome if cliente else "?",
        recebido_em=c.recebido_em,
        recebido_por_nome=(recebido_por.full_name or recebido_por.email) if recebido_por else None,
        confirmado_em=c.confirmado_em,
        confirmado_por_nome=(confirmado_por.full_name or confirmado_por.email) if confirmado_por else None,
        dias_em_aberto=dias,
        status=_status_casco(c),
        created_at=c.created_at,
    )


# ---------------------------------------------------------------------------
# GET /cascos/em-aberto — todos os cascos sem confirmacao
# ---------------------------------------------------------------------------

@router.get(
    "/em-aberto",
    response_model=EmprestimosCascoPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def listar_cascos_em_aberto(
    session: SessionDep,
    motorista_id: uuid.UUID | None = None,
) -> Any:
    """
    Lista cascos ainda nao confirmados (emprestado ou recebido_aguardando).
    Filtro opcional por motorista_id para o app do motorista.
    """
    query = (
        select(EmprestimoCasco)
        .where(col(EmprestimoCasco.confirmado_em).is_(None))
        .order_by(EmprestimoCasco.created_at)
    )
    if motorista_id:
        query = query.where(EmprestimoCasco.motorista_id == motorista_id)

    cascos = session.exec(query).all()
    total_abertos = sum(c.quantidade for c in cascos if c.recebido_em is None)

    return EmprestimosCascoPublic(
        data=[_to_casco_public(session, c) for c in cascos],
        count=len(cascos),
        total_cascos_abertos=total_abertos,
    )


# ---------------------------------------------------------------------------
# GET /cascos/aguardando-confirmacao — recebidos mas nao confirmados (gerente)
# ---------------------------------------------------------------------------

@router.get(
    "/aguardando-confirmacao",
    response_model=EmprestimosCascoPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def listar_aguardando_confirmacao(session: SessionDep) -> Any:
    """
    Lista cascos com recebido_em preenchido mas confirmado_em nulo.
    Usado pela tela de Confirmar Devoluções (somente gerente).
    """
    cascos = session.exec(
        select(EmprestimoCasco)
        .where(col(EmprestimoCasco.recebido_em).is_not(None))
        .where(col(EmprestimoCasco.confirmado_em).is_(None))
        .order_by(EmprestimoCasco.recebido_em)
    ).all()

    return EmprestimosCascoPublic(
        data=[_to_casco_public(session, c) for c in cascos],
        count=len(cascos),
        total_cascos_abertos=sum(c.quantidade for c in cascos),
    )


# ---------------------------------------------------------------------------
# GET /cascos/cliente/{cliente_id} — cascos em aberto de um cliente específico
# ---------------------------------------------------------------------------

@router.get(
    "/cliente/{cliente_id}",
    response_model=CascosClientePublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def cascos_por_cliente(session: SessionDep, cliente_id: uuid.UUID) -> Any:
    """
    Retorna cascos nao confirmados de um cliente.
    Chamado ao selecionar o cliente na tela de vendas para exibir aviso.
    """
    cascos = session.exec(
        select(EmprestimoCasco)
        .where(EmprestimoCasco.cliente_id == cliente_id)
        .where(col(EmprestimoCasco.confirmado_em).is_(None))
        .order_by(EmprestimoCasco.created_at)
    ).all()

    total_abertos = sum(c.quantidade for c in cascos if c.recebido_em is None)

    return CascosClientePublic(
        cliente_id=cliente_id,
        total_cascos_abertos=total_abertos,
        cascos=[_to_casco_public(session, c) for c in cascos],
    )


# ---------------------------------------------------------------------------
# GET /cascos/venda/{venda_id} — cascos de uma venda específica
# ---------------------------------------------------------------------------

@router.get(
    "/venda/{venda_id}",
    response_model=EmprestimosCascoPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def cascos_por_venda(session: SessionDep, venda_id: uuid.UUID) -> Any:
    cascos = session.exec(
        select(EmprestimoCasco)
        .where(EmprestimoCasco.venda_id == venda_id)
        .order_by(EmprestimoCasco.created_at)
    ).all()

    total_abertos = sum(c.quantidade for c in cascos if c.confirmado_em is None)

    return EmprestimosCascoPublic(
        data=[_to_casco_public(session, c) for c in cascos],
        count=len(cascos),
        total_cascos_abertos=total_abertos,
    )


# ---------------------------------------------------------------------------
# PATCH /cascos/{id}/receber — motorista ou gerente registra devolucao fisica
# ---------------------------------------------------------------------------

@router.patch(
    "/{casco_id}/receber",
    response_model=EmprestimoCascoPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="update"))],
)
def receber_casco(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    casco_id: uuid.UUID,
    body: EmprestimoCascoReceberRequest,
) -> Any:
    casco = session.get(EmprestimoCasco, casco_id)
    if not casco:
        raise HTTPException(status_code=404, detail="Emprestimo nao encontrado")
    if casco.recebido_em is not None:
        raise HTTPException(status_code=400, detail="Casco ja foi marcado como recebido")
    if casco.confirmado_em is not None:
        raise HTTPException(status_code=400, detail="Casco ja foi confirmado como devolvido")

    casco.recebido_em = get_datetime_utc()
    casco.recebido_por_id = current_user.id
    session.add(casco)
    session.commit()
    session.refresh(casco)
    return _to_casco_public(session, casco)


# ---------------------------------------------------------------------------
# PATCH /cascos/{id}/confirmar — gerente da baixa formal (dupla checagem)
# ---------------------------------------------------------------------------

@router.patch(
    "/{casco_id}/confirmar",
    response_model=EmprestimoCascoPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="delete"))],
)
def confirmar_devolucao_casco(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    casco_id: uuid.UUID,
    body: EmprestimoCascoConfirmarRequest,
) -> Any:
    """
    Confirmacao de devolucao — exige permissao can_delete (somente gerente).
    Motorista pode receber, mas nao confirmar.
    """
    casco = session.get(EmprestimoCasco, casco_id)
    if not casco:
        raise HTTPException(status_code=404, detail="Emprestimo nao encontrado")
    if casco.recebido_em is None:
        raise HTTPException(
            status_code=400,
            detail="Casco precisa ser marcado como recebido antes de confirmar a devolucao",
        )
    if casco.confirmado_em is not None:
        raise HTTPException(status_code=400, detail="Devolucao ja confirmada")

    casco.confirmado_em = get_datetime_utc()
    casco.confirmado_por_id = current_user.id
    session.add(casco)
    session.commit()
    session.refresh(casco)
    return _to_casco_public(session, casco)
