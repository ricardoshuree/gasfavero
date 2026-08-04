# [mcp-local harness] feature: rbac-permission-matrix-and-produtos | plano: 5220fc65 | 2026-08-04 14:13:39
# Items convertido de logica de dono individual para RBAC compartilhado via modulo 'produtos'
"""
Rotas de "Items" -- tecnicamente o nome interno segue o do template
original, mas no gasfavero este é o catálogo de Produtos (ver
frontend/src/routes/_layout/produtos.tsx). Nome técnico (item/items)
e nome de negócio (Produto/produtos) divergem de propósito: o backend
fica genérico, o rótulo pro usuário final é decidido no frontend.

Controle de acesso via módulo RBAC "produtos" (ver Permissões na tela
de admin) -- NÃO é mais por dono individual como no template original.
Catálogo compartilhado: quem tem permissão de leitura no módulo vê
tudo, independente de quem cadastrou.
"""
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, require_module_permission
from app.models import Item, ItemCreate, ItemPublic, ItemsPublic, ItemUpdate, Message

router = APIRouter(prefix="/items", tags=["items"])

MODULE = "produtos"


@router.get(
    "/",
    response_model=ItemsPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_items(session: SessionDep, skip: int = 0, limit: int = 100) -> Any:
    """Lista o catálogo de produtos -- compartilhado entre todos os
    usuários com permissão de leitura no módulo 'produtos'."""
    count_statement = select(func.count()).select_from(Item)
    count = session.exec(count_statement).one()
    statement = (
        select(Item).order_by(col(Item.created_at).desc()).offset(skip).limit(limit)
    )
    items = session.exec(statement).all()
    items_public = [ItemPublic.model_validate(item) for item in items]
    return ItemsPublic(data=items_public, count=count)


@router.get(
    "/{id}",
    response_model=ItemPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_item(session: SessionDep, id: uuid.UUID) -> Any:
    """Get item by ID."""
    item = session.get(Item, id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.post(
    "/",
    response_model=ItemPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="create"))],
)
def create_item(*, session: SessionDep, current_user: CurrentUser, item_in: ItemCreate) -> Any:
    """
    Create new item. owner_id é preservado só como trilha de
    auditoria (quem cadastrou) -- não é mais usado para controle de
    acesso, isso agora é feito pelo módulo RBAC "produtos".
    """
    item = Item.model_validate(item_in, update={"owner_id": current_user.id})
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.put(
    "/{id}",
    response_model=ItemPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="update"))],
)
def update_item(*, session: SessionDep, id: uuid.UUID, item_in: ItemUpdate) -> Any:
    """Update an item."""
    item = session.get(Item, id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    update_dict = item_in.model_dump(exclude_unset=True)
    item.sqlmodel_update(update_dict)
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.delete(
    "/{id}",
    dependencies=[Depends(require_module_permission(MODULE, action="delete"))],
)
def delete_item(session: SessionDep, id: uuid.UUID) -> Message:
    """Delete an item."""
    item = session.get(Item, id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    session.delete(item)
    session.commit()
    return Message(message="Item deleted successfully")
