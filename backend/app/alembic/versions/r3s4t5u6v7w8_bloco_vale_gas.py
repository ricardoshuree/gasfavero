"""gasfavero: bloco de vale gas

Revision ID: r3s4t5u6v7w8
Revises: q2r3s4t5u6v7
Create Date: 2026-09-05

Cria tabela bloco_vale_gas (estabelecimento PJ associado a intervalo
de folhas de vale gas impresso por grafica) e modulo RBAC vale_gas.

Decisoes:
- Numeracao propria, separada dos blocos de fiado dos motoristas
- Um bloco por cliente (unique cliente_id)
- data = quando o bloco entrou em circulacao (informativo)
"""
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op
import uuid as _uuid

revision = "r3s4t5u6v7w8"
down_revision = "q2r3s4t5u6v7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bloco_vale_gas",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("cliente_id", UUID(as_uuid=False),
                  sa.ForeignKey("cliente.id", ondelete="RESTRICT"), nullable=False, unique=True),
        sa.Column("primeira_folha", sa.Integer(), nullable=False),
        sa.Column("ultima_folha", sa.Integer(), nullable=False),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )

    # Modulo RBAC vale_gas
    conn = op.get_bind()
    module_id = str(_uuid.uuid4())
    conn.execute(
        sa.text(
            "INSERT INTO module (id, name, description, label) "
            "VALUES (:id, :name, :desc, :label) "
            "ON CONFLICT (name) DO NOTHING"
        ),
        {"id": module_id, "name": "vale_gas",
         "desc": "Gestao de Blocos de Vale Gas (estabelecimentos PJ)",
         "label": "Vale Gas"},
    )

    # Admin: CRUD completo
    admin_role = conn.execute(
        sa.text("SELECT id FROM role WHERE name = 'admin'")
    ).fetchone()
    module_row = conn.execute(
        sa.text("SELECT id FROM module WHERE name = 'vale_gas'")
    ).fetchone()
    if admin_role and module_row:
        conn.execute(
            sa.text(
                "INSERT INTO role_permission (role_id, module_id, "
                "can_create, can_read, can_update, can_delete) "
                "VALUES (:r, :m, true, true, true, true) "
                "ON CONFLICT (role_id, module_id) DO NOTHING"
            ),
            {"r": str(admin_role[0]), "m": str(module_row[0])},
        )

    # Gerente: criar e ler
    gerente_role = conn.execute(
        sa.text("SELECT id FROM role WHERE name = 'gerente'")
    ).fetchone()
    if gerente_role and module_row:
        conn.execute(
            sa.text(
                "INSERT INTO role_permission (role_id, module_id, "
                "can_create, can_read, can_update, can_delete) "
                "VALUES (:r, :m, true, true, false, false) "
                "ON CONFLICT (role_id, module_id) DO NOTHING"
            ),
            {"r": str(gerente_role[0]), "m": str(module_row[0])},
        )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "DELETE FROM role_permission WHERE module_id = "
            "(SELECT id FROM module WHERE name = 'vale_gas')"
        )
    )
    conn.execute(sa.text("DELETE FROM module WHERE name = 'vale_gas'"))
    op.drop_table("bloco_vale_gas")
