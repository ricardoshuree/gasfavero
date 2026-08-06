# [mcp-local harness] feature: livro-vendas-modulo-rbac | plano: 33708daf | 2026-08-06 09:31:51
# Migration idempotente que cria o modulo livro_vendas, sem atribuir RolePermission (fica pra tela de Permissoes)
"""gasfavero: modulo Livro de Vendas

Revision ID: f1a2b3c4d5e6
Revises: a7b8c9d0e1f2
Create Date: 2026-08-06

ESPECÍFICO DESTE ERP (gasfavero) -- NÃO portar pro erp-core-template.

Cria o módulo RBAC "livro_vendas", que gateia a tela "Livro de
Vendas" (dashboard geral de todas as vendas -- qualquer forma de
pagamento -- com menu interativo Ano/Mês/Semana, gráfico e tabela
paginada com filtro próprio de intervalo de datas).

É um módulo PRÓPRIO, separado de "vendas" (diferente do Recebimento
de Vale, que reaproveita o módulo "vendas") -- decisão do Ricardo,
pra poder restringir o acesso independentemente (ex: só "gerente").

Idempotente (seguro rodar de novo). NÃO grava RolePermission para
nenhuma role -- a atribuição de CRUD por role fica a critério de quem
administra o sistema, via a tela "Permissões" (matriz de permissões).
"""
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy import column, table

revision = "f1a2b3c4d5e6"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


module_table = table(
    "module",
    column("id", sa.Uuid()),
    column("name", sa.String),
    column("description", sa.String),
)

MODULE_NAME = "livro_vendas"
MODULE_DESCRIPTION = "Livro de Vendas -- dashboard geral de vendas (todas as formas de pagamento)"


def _scalar_uuid(bind, query: str, params: dict) -> uuid.UUID | None:
    """SELECT escalar tolerante ao formato de retorno do driver
    (uuid.UUID nativo ou string) -- sempre devolve uuid.UUID ou None."""
    result = bind.execute(sa.text(query), params).scalar()
    if result is None:
        return None
    return result if isinstance(result, uuid.UUID) else uuid.UUID(str(result))


def upgrade() -> None:
    bind = op.get_bind()

    existing_id = _scalar_uuid(
        bind, "SELECT id FROM module WHERE name = :name", {"name": MODULE_NAME}
    )
    if existing_id is None:
        bind.execute(
            module_table.insert().values(
                id=uuid.uuid4(), name=MODULE_NAME, description=MODULE_DESCRIPTION
            )
        )


def downgrade() -> None:
    bind = op.get_bind()

    # Remove a matriz de permissões desse módulo antes do módulo em
    # si (evita violar a FK role_permission.module_id em bancos sem
    # ON DELETE CASCADE aplicado corretamente).
    bind.execute(
        sa.text(
            "DELETE FROM role_permission WHERE module_id IN "
            "(SELECT id FROM module WHERE name = :name)"
        ),
        {"name": MODULE_NAME},
    )
    bind.execute(
        sa.text("DELETE FROM module WHERE name = :name"),
        {"name": MODULE_NAME},
    )
