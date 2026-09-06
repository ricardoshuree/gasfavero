# [mcp-local harness] feature: venda-vale-gas | plano: 9a811f03 | 2026-09-05 21:32:43
# Adiciona vale_gas_numero na tabela venda para registrar numero da folha do talao de vale gas
"""gasfavero: venda com vale gas

Revision ID: s4t5u6v7w8x9
Revises: r3s4t5u6v7w8
Create Date: 2026-09-05

Adiciona campo vale_gas_numero na tabela venda para registrar o numero
da folha do talao de vale gas quando a forma de pagamento for 'vale_gas'.

Nao cria tabela separada de vale_gas individual (diferente do BlocoVale
que tem Vale por numero) -- o numero e gravado direto na venda porque
o controle de baixa sera feito em lote pelo estabelecimento (Recebimento
de Vale Gas), nao folha a folha.
"""
import sqlalchemy as sa
from alembic import op

revision = "s4t5u6v7w8x9"
down_revision = "r3s4t5u6v7w8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "venda",
        sa.Column("vale_gas_numero", sa.Integer(), nullable=True),
    )
    # FK para bloco_vale_gas -- qual bloco (estabelecimento) este vale pertence
    op.add_column(
        "venda",
        sa.Column(
            "vale_gas_bloco_id",
            sa.dialects.postgresql.UUID(as_uuid=False),
            sa.ForeignKey("bloco_vale_gas.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("venda", "vale_gas_bloco_id")
    op.drop_column("venda", "vale_gas_numero")
