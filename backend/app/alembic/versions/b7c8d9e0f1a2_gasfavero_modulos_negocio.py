# [mcp-local harness] feature: rbac-modulos-negocio | plano: 9b43efb2 | 2026-08-04 19:13:35
# Migration idempotente que cria os modulos vendas/clientes/vales/inadimplencia/delegacao/mapa, sem atribuir RolePermission (fica pra tela de Permissoes)
# [mcp-local harness] feature: rbac-modulos-negocio | plano: 9b43efb2
# Migration gasfavero-specific: cria os 6 modulos RBAC de negocio
# levantados no apanhado de requisitos do Giovani Favero (vendas,
# clientes, vales, inadimplencia, delegacao, mapa)
"""gasfavero: modulos de negocio (vendas, clientes, vales, inadimplencia, delegacao, mapa)

Revision ID: b7c8d9e0f1a2
Revises: d4e5f6a7b8c9
Create Date: 2026-08-04

ESPECÍFICO DESTE ERP (gasfavero) -- NÃO portar pro erp-core-template.

Cria os módulos RBAC que vão gatear as telas funcionais descritas nos
requisitos do Giovani Favero (Parte 3):

    vendas         -- registro de vendas de produtos e entregas
    clientes       -- cadastro de clientes e endereços
    vales          -- cadastro de blocos de vale e vendas a prazo
    inadimplencia  -- consulta e baixa de vendas a prazo em aberto
    delegacao      -- delegação de venda e localização de motoristas
    mapa           -- configuração de regiões e mapas de atendimento

Idempotente (seguro rodar de novo). NÃO grava RolePermission para
nenhuma role -- a atribuição de CRUD por role (Gerente/Motorista/etc)
fica a critério de quem administra o sistema, via a tela "Permissões"
(matriz de permissões) já existente. Isso evita presumir uma política
de acesso que ainda não foi validada com o Giovani.
"""
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy import column, table

revision = "b7c8d9e0f1a2"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


module_table = table(
    "module",
    column("id", sa.Uuid()),
    column("name", sa.String),
    column("description", sa.String),
)

NEW_MODULES = [
    ("vendas", "Registro de vendas de produtos e entregas"),
    ("clientes", "Cadastro de clientes e endereços"),
    ("vales", "Cadastro de blocos de vale e vendas a prazo"),
    ("inadimplencia", "Consulta e baixa de vendas a prazo em aberto"),
    ("delegacao", "Delegação de venda e localização de motoristas"),
    ("mapa", "Configuração de regiões e mapas de atendimento"),
]


def _scalar_uuid(bind, query: str, params: dict) -> uuid.UUID | None:
    """SELECT escalar tolerante ao formato de retorno do driver
    (uuid.UUID nativo ou string) -- sempre devolve uuid.UUID ou None."""
    result = bind.execute(sa.text(query), params).scalar()
    if result is None:
        return None
    return result if isinstance(result, uuid.UUID) else uuid.UUID(str(result))


def upgrade() -> None:
    bind = op.get_bind()

    for name, description in NEW_MODULES:
        existing_id = _scalar_uuid(
            bind, "SELECT id FROM module WHERE name = :name", {"name": name}
        )
        if existing_id is None:
            bind.execute(
                module_table.insert().values(
                    id=uuid.uuid4(), name=name, description=description
                )
            )


def downgrade() -> None:
    bind = op.get_bind()
    names = [name for name, _ in NEW_MODULES]

    # Remove a matriz de permissões desses módulos antes do módulo em
    # si (evita violar a FK role_permission.module_id em bancos sem
    # ON DELETE CASCADE aplicado corretamente).
    bind.execute(
        sa.text(
            "DELETE FROM role_permission WHERE module_id IN "
            "(SELECT id FROM module WHERE name = ANY(:names))"
        ),
        {"names": names},
    )
    bind.execute(
        sa.text("DELETE FROM module WHERE name = ANY(:names)"),
        {"names": names},
    )
