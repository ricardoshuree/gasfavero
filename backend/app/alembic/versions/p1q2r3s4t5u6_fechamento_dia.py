# [mcp-local harness] feature: fechamento-dia | plano: e9667526 | 2026-09-04 15:41:47
# Cria tabela fechamento_dia com totais por forma de pagamento, contagem física e diferença
"""gasfavero: tabela fechamento_dia (Fase 3 fechamento diario)

Revision ID: p1q2r3s4t5u6
Revises: o0p1q2r3s4t5
Create Date: 2026-09-04

FechamentoDia registra o fechamento do malote de cada motorista:
- Uma por motorista por data (unique constraint)
- Vinculada obrigatoriamente a uma AberturaDia
- Armazena totais por forma de pagamento e contagem fisica
- Registra diferenca (sobra/quebra) e justificativa
- Gera lancamentos contabeis ao ser confirmada
"""
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision = "p1q2r3s4t5u6"
down_revision = "o0p1q2r3s4t5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "fechamento_dia",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("abertura_id", UUID(as_uuid=False), sa.ForeignKey("abertura_dia.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("motorista_id", UUID(as_uuid=False), sa.ForeignKey("user.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("data", sa.Date(), nullable=False),
        # totais por forma de pagamento (calculados das vendas do dia)
        sa.Column("total_dinheiro", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("total_pix", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("total_debito", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("total_credito", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("total_fiado", sa.Numeric(10, 2), nullable=False, server_default="0"),
        # contagem fisica de especie
        sa.Column("contagem_especie", sa.JSON(), nullable=True),  # {100: 2, 50: 3, ...}
        sa.Column("total_contado", sa.Numeric(10, 2), nullable=False, server_default="0"),
        # esperado = fundo_troco + total_dinheiro
        sa.Column("total_esperado", sa.Numeric(10, 2), nullable=False, server_default="0"),
        # diferenca = total_contado - total_esperado
        sa.Column("diferenca", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("justificativa", sa.String(500), nullable=True),
        # controle
        sa.Column("fechado_por_id", UUID(as_uuid=False), sa.ForeignKey("user.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("motorista_id", "data", name="uq_fechamento_motorista_data"),
    )


def downgrade() -> None:
    op.drop_table("fechamento_dia")
