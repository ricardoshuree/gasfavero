# [mcp-local harness] feature: abertura-log-edicao | plano: afb4479e | 2026-09-05 23:04:57
# Migration que cria abertura_dia_log para rastrear edicoes de abertura
"""gasfavero: log de edicoes de abertura do dia

Revision ID: t5u6v7w8x9y0
Revises: s4t5u6v7w8x9
Create Date: 2026-09-05

Cria tabela abertura_dia_log para registrar qualquer edicao feita
numa abertura ja confirmada. Cada linha representa um campo alterado,
com valor anterior e novo, usuario e timestamp.

Tambem adiciona coluna editado_por_id na abertura_dia (se nao existir)
para saber quem foi o ultimo editor.
"""
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision = "t5u6v7w8x9y0"
down_revision = "s4t5u6v7w8x9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "abertura_dia_log",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("abertura_id", UUID(as_uuid=False),
                  sa.ForeignKey("abertura_dia.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("campo", sa.String(100), nullable=False),
        sa.Column("valor_anterior", sa.String(500), nullable=False),
        sa.Column("valor_novo", sa.String(500), nullable=False),
        sa.Column("editado_por_id", UUID(as_uuid=False),
                  sa.ForeignKey("user.id", ondelete="SET NULL"),
                  nullable=True),
        sa.Column("editado_em", sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.func.now()),
    )

    # editado_por_id na abertura_dia pode ja existir (adicionado no editar_abertura anterior)
    # Adicionamos com IF NOT EXISTS via SQL direto
    op.execute(
        "ALTER TABLE abertura_dia ADD COLUMN IF NOT EXISTS "
        "editado_por_id UUID REFERENCES \"user\"(id) ON DELETE SET NULL"
    )
    op.execute(
        "ALTER TABLE abertura_dia ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ"
    )


def downgrade() -> None:
    op.drop_table("abertura_dia_log")
