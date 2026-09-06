# [mcp-local harness] feature: venda-edicao | plano: ee66766a | 2026-09-06 00:49:21
# Migration: cria venda_log e adiciona cancelada_em, cancelada_por_id, status na venda
"""gasfavero: edicao e cancelamento de venda

Revision ID: v7w8x9y0z1a2
Revises: u6v7w8x9y0z1
Create Date: 2026-09-06

Adiciona suporte a edicao simples e cancelamento de vendas:

  venda_log: auditoria campo a campo (mesmo padrao do abertura_dia_log)
    - campo, valor_anterior, valor_novo, editado_por_id, editado_em

  venda:
    - cancelada_em (TIMESTAMPTZ): preenchido no cancelamento
    - cancelada_por_id (UUID FK user): quem cancelou
    - status (VARCHAR 20, default 'ativa'): 'ativa' | 'cancelada'
"""
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision = "v7w8x9y0z1a2"
down_revision = "u6v7w8x9y0z1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "venda_log",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("venda_id", UUID(as_uuid=False),
                  sa.ForeignKey("venda.id", ondelete="CASCADE"), nullable=False),
        sa.Column("campo", sa.String(100), nullable=False),
        sa.Column("valor_anterior", sa.String(500), nullable=False),
        sa.Column("valor_novo", sa.String(500), nullable=False),
        sa.Column("editado_por_id", UUID(as_uuid=False),
                  sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("editado_em", sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.func.now()),
    )

    op.execute(
        "ALTER TABLE venda ADD COLUMN IF NOT EXISTS "
        "cancelada_em TIMESTAMPTZ"
    )
    op.execute(
        "ALTER TABLE venda ADD COLUMN IF NOT EXISTS "
        "cancelada_por_id UUID REFERENCES \"user\"(id) ON DELETE SET NULL"
    )
    op.execute(
        "ALTER TABLE venda ADD COLUMN IF NOT EXISTS "
        "status VARCHAR(20) NOT NULL DEFAULT 'ativa'"
    )


def downgrade() -> None:
    op.drop_table("venda_log")
    op.execute("ALTER TABLE venda DROP COLUMN IF EXISTS cancelada_em")
    op.execute("ALTER TABLE venda DROP COLUMN IF EXISTS cancelada_por_id")
    op.execute("ALTER TABLE venda DROP COLUMN IF EXISTS status")
