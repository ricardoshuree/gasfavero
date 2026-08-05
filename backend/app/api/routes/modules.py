# [mcp-local harness] feature: clientes-precos-vales-e-module-label | plano: 7a1919ed | 2026-08-04 23:24:52
# Adiciona PATCH /modules/{id} pra editar label/description (nao o slug name)
# [mcp-local harness] feature: clientes-precos-vales-e-module-label | plano: 7a1919ed
# Adiciona PATCH /modules/{id} -- edita so label/description (nunca o name/slug tecnico)
"""
Rotas de administração dos módulos RBAC e da matriz de permissões
(Role x Módulo x Ação). Protegido por superuser -- é aqui que se
decide quem (qual role) pode criar/ver/editar/apagar em cada módulo.
"""
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select

from app.api.deps import SessionDep, get_current_active_superuser
from app.models import (
    Module,
    ModulePermissionMatrix,
    ModulePermissionMatrixUpdate,
    ModulePublic,
    ModulesPublic,
    ModuleUpdate,
    Role,
    RolePermission,
    RolePermissionEntry,
)

router = APIRouter(
    prefix="/modules",
    tags=["modules"],
    dependencies=[Depends(get_current_active_superuser)],
)


@router.get("/", response_model=ModulesPublic)
def read_modules(session: SessionDep) -> Any:
    """Lista todos os módulos RBAC cadastrados."""
    modules = session.exec(select(Module).order_by(Module.name)).all()
    return ModulesPublic(data=[ModulePublic.model_validate(m) for m in modules])


@router.patch("/{module_id}", response_model=ModulePublic)
def update_module(
    *, session: SessionDep, module_id: uuid.UUID, module_in: ModuleUpdate
) -> Any:
    """
    Edita o label e/ou a description de exibição de um módulo (ex:
    trocar "Delegacao" por "Delegação" com acento).

    NUNCA edita `name` (o slug técnico) -- essa string é referenciada
    literalmente em require_module_permission("delegacao") no código
    das rotas, então mudá-la quebraria qualquer rota que já dependa
    dela. Por isso ModuleUpdate nem expõe esse campo.
    """
    module = session.get(Module, module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")

    update_data = module_in.model_dump(exclude_unset=True)
    module.sqlmodel_update(update_data)
    session.add(module)
    session.commit()
    session.refresh(module)
    return module


@router.get("/{module_id}/permissions", response_model=ModulePermissionMatrix)
def read_module_permissions(session: SessionDep, module_id: uuid.UUID) -> Any:
    """
    Matriz de permissões do módulo: uma linha por role existente, com
    os 4 flags CRUD (zerados se a role ainda não tem RolePermission
    para este módulo).
    """
    module = session.get(Module, module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")

    roles = session.exec(select(Role).order_by(Role.name)).all()
    existing = {
        rp.role_id: rp
        for rp in session.exec(
            select(RolePermission).where(RolePermission.module_id == module_id)
        ).all()
    }

    entries = [
        RolePermissionEntry(
            role_id=role.id,
            role_name=role.name,
            can_create=existing[role.id].can_create if role.id in existing else False,
            can_read=existing[role.id].can_read if role.id in existing else False,
            can_update=existing[role.id].can_update if role.id in existing else False,
            can_delete=existing[role.id].can_delete if role.id in existing else False,
        )
        for role in roles
    ]

    return ModulePermissionMatrix(
        module=ModulePublic.model_validate(module), entries=entries
    )


@router.put("/{module_id}/permissions", response_model=ModulePermissionMatrix)
def update_module_permissions(
    *, session: SessionDep, module_id: uuid.UUID, body: ModulePermissionMatrixUpdate
) -> Any:
    """
    Grava a matriz de permissões do módulo de uma vez -- upsert por
    role (cria a linha se não existir, atualiza os 4 flags se existir).
    """
    module = session.get(Module, module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")

    for entry in body.entries:
        role = session.get(Role, entry.role_id)
        if not role:
            raise HTTPException(
                status_code=404, detail=f"Role '{entry.role_id}' not found"
            )

        perm = session.exec(
            select(RolePermission)
            .where(RolePermission.role_id == entry.role_id)
            .where(RolePermission.module_id == module_id)
        ).first()
        if perm:
            perm.can_create = entry.can_create
            perm.can_read = entry.can_read
            perm.can_update = entry.can_update
            perm.can_delete = entry.can_delete
            session.add(perm)
        else:
            session.add(
                RolePermission(
                    role_id=entry.role_id,
                    module_id=module_id,
                    can_create=entry.can_create,
                    can_read=entry.can_read,
                    can_update=entry.can_update,
                    can_delete=entry.can_delete,
                )
            )

    session.commit()
    return read_module_permissions(session=session, module_id=module_id)
