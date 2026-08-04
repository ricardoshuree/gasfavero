# [mcp-local harness] feature: gestao-roles-crud | plano: 9728719f | 2026-08-04 18:30:25
# Adiciona POST/PATCH/DELETE para CRUD completo de Role RBAC. GET passa a incluir user_count por role. Delete é protegido por confirmação na UI (não no backend) -- o cascade de RolePermission/UserRole já existe no schema.
"""
Rotas de gestão das roles RBAC (admin, editor, viewer, mais quaisquer
roles customizadas criadas depois, ex: "gerente", "motorista").

CRUD completo: listar (com contagem de usuários vinculados), criar,
editar (nome/descrição) e apagar. A matriz de permissão por módulo
(role_permission) continua em modules.py -- aqui só a role em si.
"""
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import func, select

from app.api.deps import SessionDep, get_current_active_superuser
from app.models import Message, Role, RoleCreate, RolePublic, RolesPublic, RoleUpdate, UserRole

router = APIRouter(
    prefix="/roles",
    tags=["roles"],
    dependencies=[Depends(get_current_active_superuser)],
)


def _user_count(session: SessionDep, role_id: uuid.UUID) -> int:
    return session.exec(
        select(func.count()).select_from(UserRole).where(UserRole.role_id == role_id)
    ).one()


def _to_public(session: SessionDep, role: Role) -> RolePublic:
    return RolePublic.model_validate(role).model_copy(
        update={"user_count": _user_count(session, role.id)}
    )


@router.get("/", response_model=RolesPublic)
def read_roles(session: SessionDep) -> Any:
    """Lista todas as roles RBAC cadastradas, ordenadas por nome, com
    a contagem de usuários vinculados a cada uma -- a UI usa isso pra
    avisar antes de deixar apagar uma role em uso."""
    roles = session.exec(select(Role).order_by(Role.name)).all()
    return RolesPublic(data=[_to_public(session, r) for r in roles])


@router.post("/", response_model=RolePublic)
def create_role(session: SessionDep, role_in: RoleCreate) -> Any:
    """Cria uma nova role RBAC (ex: 'gerente', 'motorista')."""
    existing = session.exec(select(Role).where(Role.name == role_in.name)).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Já existe uma role com o nome '{role_in.name}'",
        )
    role = Role(name=role_in.name, description=role_in.description)
    session.add(role)
    session.commit()
    session.refresh(role)
    return _to_public(session, role)


@router.patch("/{role_id}", response_model=RolePublic)
def update_role(session: SessionDep, role_id: uuid.UUID, role_in: RoleUpdate) -> Any:
    """Edita nome e/ou descrição de uma role existente. Renomear não
    afeta RolePermission/UserRole -- esses são ligados por role_id."""
    role = session.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role não encontrada")

    if role_in.name is not None and role_in.name != role.name:
        existing = session.exec(select(Role).where(Role.name == role_in.name)).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Já existe uma role com o nome '{role_in.name}'",
            )

    update_data = role_in.model_dump(exclude_unset=True)
    role.sqlmodel_update(update_data)
    session.add(role)
    session.commit()
    session.refresh(role)
    return _to_public(session, role)


@router.delete("/{role_id}", response_model=Message)
def delete_role(session: SessionDep, role_id: uuid.UUID) -> Any:
    """Apaga uma role RBAC. Isso remove em CASCADE a matriz de
    permissões (RolePermission) e os vínculos de usuário (UserRole)
    dessa role -- a confirmação com o número de usuários afetados
    acontece na UI (dialog de delete), não aqui."""
    role = session.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role não encontrada")
    session.delete(role)
    session.commit()
    return Message(message="Role apagada com sucesso")
