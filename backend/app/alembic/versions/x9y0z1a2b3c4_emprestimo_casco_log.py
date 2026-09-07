# [mcp-local harness] feature: emprestimo_casco_historico | plano: 45b87eee | 2026-09-07 16:42:23
# Migration: cria tabela emprestimo_casco_log para auditoria de eventos de casco
"""gasfavero: log de auditoria para emprestimo_casco

Revision ID: x9y0z1a2b3c4
Revises: w8x9y0z1a2b3
Create Date: 2026-09-07

Cria tabela emprestimo_casco_log para registrar todas as transições de estado
do empréstimo de casco (recebimento, confirmação e respectivos desfazimentos).

Campos:
  - emprestimo_id: FK para emprestimo_casco
  - evento: 'recebido' | 'recebimento_desfeito' | 'confirmado' | 'confirmacao_desfeita'
  - usuario_id: quem executou a ação
  - observacao: campo livre opcional (motivo do desfazimento etc.)
  - created_at: timestamp do evento
"""
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision = "x9y0z1a2b3c4"
down_revision = "w8x9y0z1a2b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "emprestimo_casco_log",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column(
            "emprestimo_id", UUID(as_uuid=False),
            sa.ForeignKey("emprestimo_casco.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("evento", sa.String(50), nullable=False),
        sa.Column(
            "usuario_id", UUID(as_uuid=False),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("observacao", sa.String(500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_emprestimo_casco_log_emprestimo_id", "emprestimo_casco_log", ["emprestimo_id"])


def downgrade() -> None:
    op.drop_index("ix_emprestimo_casco_log_emprestimo_id", "emprestimo_casco_log")
    op.drop_table("emprestimo_casco_log")
