# [mcp-local harness] feature: rbac-permission-matrix-and-produtos | plano: 5220fc65 | 2026-08-04 14:14:01
# Migration gasfavero-specific: cria modulo produtos, roles gerente/vendedor, e a matriz de permissoes inicial
"""gasfavero: modulo produtos + roles gerente/vendedor

Revision ID: d4e5f6a7b8c9
Revises: c3f4a5b6d7e8
Create Date: 2026-08-04

ESPECÍFICO DESTE ERP (gasfavero) -- NÃO portar pro erp-core-template.
O template continua só com admin/editor/viewer e usuarios/configuracoes;
"produtos"/"gerente"/"vendedor" são vocabulário de negócio deste ERP.

Cria o módulo "produtos" e as roles de negócio "gerente" e "vendedor",
com a matriz de permissões inicial (idempotente -- seguro rodar de novo):

    Role      | criar | ver | editar | apagar |
    admin     |  sim  | sim |  sim   |  sim   |
    gerente   |  sim  | sim |  sim   |  não   |
    vendedor  |  não  | sim |  não   |  não   |

(superuser sempre tem acesso total, independente desta matriz -- ver
require_module_permission em app/api/deps.py)
"""
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy import column, table

revision = "d4e5f6a7b8c9"
down_revision = "c3f4a5b6d7e8"
branch_labels = None
depends_on = None


module_table = table(
    "module",
    column("id", sa.Uuid()),
    column("name", sa.String),
    column("description", sa.String),
)

role_table = table(
    "role",
    column("id", sa.Uuid()),
    column("name", sa.String),
    column("description", sa.String),
)

role_permission_table = table(
    "role_permission",
    column("role_id", sa.Uuid()),
    column("module_id", sa.Uuid()),
    column("can_create", sa.Boolean),
    column("can_read", sa.Boolean),
    column("can_update", sa.Boolean),
    column("can_delete", sa.Boolean),
)


def _scalar_uuid(bind, query: str, params: dict) -> uuid.UUID | None:
    """SELECT escalar tolerante ao formato de retorno do driver
    (uuid.UUID nativo ou string) -- sempre devolve uuid.UUID ou None."""
    result = bind.execute(sa.text(query), params).scalar()
    if result is None:
        return None
    return result if isinstance(result, uuid.UUID) else uuid.UUID(str(result))


def upgrade() -> None:
    bind = op.get_bind()

    # --- módulo produtos (idempotente) ---
    module_id = _scalar_uuid(
        bind, "SELECT id FROM module WHERE name = 'produtos'", {}
    )
    if module_id is None:
        module_id = uuid.uuid4()
        bind.execute(
            module_table.insert().values(
                id=module_id,
                name="produtos",
                description="Cadastro de produtos do catálogo",
            )
        )

    # --- roles de negócio gerente / vendedor (idempotente) ---
    def get_or_create_role(name: str, description: str) -> uuid.UUID:
        existing = _scalar_uuid(
            bind, "SELECT id FROM role WHERE name = :name", {"name": name}
        )
        if existing is not None:
            return existing
        new_id = uuid.uuid4()
        bind.execute(
            role_table.insert().values(id=new_id, name=name, description=description)
        )
        return new_id

    gerente_id = get_or_create_role(
        "gerente", "Cria, vê e edita produtos, mas não apaga"
    )
    vendedor_id = get_or_create_role(
        "vendedor", "Somente consulta o catálogo de produtos"
    )
    admin_id = _scalar_uuid(bind, "SELECT id FROM role WHERE name = 'admin'", {})

    # --- matriz de permissões inicial em produtos (idempotente) ---
    def upsert_permission(
        role_id: uuid.UUID | None,
        can_create: bool,
        can_read: bool,
        can_update: bool,
        can_delete: bool,
    ) -> None:
        if role_id is None:
            return
        exists = bind.execute(
            sa.text(
                "SELECT 1 FROM role_permission "
                "WHERE role_id = :role_id AND module_id = :module_id"
            ),
            {"role_id": role_id, "module_id": module_id},
        ).scalar()
        if exists:
            return
        bind.execute(
            role_permission_table.insert().values(
                role_id=role_id,
                module_id=module_id,
                can_create=can_create,
                can_read=can_read,
                can_update=can_update,
                can_delete=can_delete,
            )
        )

    upsert_permission(admin_id, True, True, True, True)
    upsert_permission(gerente_id, True, True, True, False)
    upsert_permission(vendedor_id, False, True, False, False)


def downgrade() -> None:
    bind = op.get_bind()
    module_id = _scalar_uuid(
        bind, "SELECT id FROM module WHERE name = 'produtos'", {}
    )
    if module_id is not None:
        bind.execute(
            sa.text("DELETE FROM role_permission WHERE module_id = :module_id"),
            {"module_id": module_id},
        )
        bind.execute(
            sa.text("DELETE FROM module WHERE id = :module_id"),
            {"module_id": module_id},
        )
    # Não removemos as roles gerente/vendedor no downgrade -- podem já
    # ter sido atribuídas a usuários reais; desfazer só o módulo e a
    # matriz de permissões é mais seguro que apagar a role em si.
