# [mcp-local harness] feature: carga-produtos-abertura-fechamento | plano: b7702599 | 2026-09-04 18:18:42
# Cria tabelas abertura_dia_produto e fechamento_dia_produto para controle informativo de carga
"""gasfavero: carga de produtos na abertura e fechamento do dia

Revision ID: q2r3s4t5u6v7
Revises: p1q2r3s4t5u6
Create Date: 2026-09-04

Adiciona controle informativo de carga de botijoes por motorista:
- abertura_dia_produto: produtos carregados na saida (por abertura)
- fechamento_dia_produto: produtos retornados no fechamento

Ambas sao informativas -- nao bloqueiam nenhum fluxo.
O calculo de vendidos = carregado - retornado e feito pelo endpoint.
"""
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision = "q2r3s4t5u6v7"
down_revision = "p1q2r3s4t5u6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "abertura_dia_produto",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("abertura_id", UUID(as_uuid=False), sa.ForeignKey("abertura_dia.id", ondelete="CASCADE"), nullable=False),
        sa.Column("produto_id", UUID(as_uuid=False), sa.ForeignKey("item.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("quantidade", sa.Integer(), nullable=False),
        sa.UniqueConstraint("abertura_id", "produto_id", name="uq_abertura_produto"),
    )

    op.create_table(
        "fechamento_dia_produto",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("fechamento_id", UUID(as_uuid=False), sa.ForeignKey("fechamento_dia.id", ondelete="CASCADE"), nullable=False),
        sa.Column("produto_id", UUID(as_uuid=False), sa.ForeignKey("item.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("quantidade_retorno", sa.Integer(), nullable=False),
        sa.UniqueConstraint("fechamento_id", "produto_id", name="uq_fechamento_produto"),
    )


def downgrade() -> None:
    op.drop_table("fechamento_dia_produto")
    op.drop_table("abertura_dia_produto")
