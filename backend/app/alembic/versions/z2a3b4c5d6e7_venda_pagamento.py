# [mcp-local harness] feature: tema2_multiplas_formas_backend | plano: 38d656ed | 2026-09-09 17:43:55
# Migration: cria tabela venda_pagamento
"""venda_pagamento — múltiplas formas de pagamento por venda

Revision ID: z2a3b4c5d6e7
Revises: y1z2a3b4c5d6
Create Date: 2026-09-09
"""
from alembic import op
import sqlalchemy as sa

revision = "z2a3b4c5d6e7"
down_revision = "y1z2a3b4c5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Tabela de recebíveis por forma de pagamento
    op.create_table(
        "venda_pagamento",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("venda_id", sa.Uuid(), nullable=False),
        sa.Column("forma_pagamento", sa.String(length=20), nullable=False),
        # valor: quanto desta forma de pagamento foi acordado
        sa.Column("valor", sa.Numeric(precision=10, scale=2), nullable=False),
        # pago_em: null = em aberto; preenchido = recebível quitado
        sa.Column("pago_em", sa.DateTime(timezone=True), nullable=True),
        # campos exclusivos de fiado (vale)
        sa.Column("vale_id", sa.Uuid(), nullable=True),
        sa.Column("data_pagamento_vale", sa.Date(), nullable=True),
        # campos exclusivos de vale_gas
        sa.Column("vale_gas_numero", sa.Integer(), nullable=True),
        sa.Column("vale_gas_bloco_id", sa.Uuid(), nullable=True),
        # campos exclusivos de gas_povo
        sa.Column("gas_povo_frete", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("gas_povo_frete_recebido_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["venda_id"], ["venda.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["vale_id"], ["vale.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["vale_gas_bloco_id"], ["bloco_vale_gas.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_venda_pagamento_venda_id", "venda_pagamento", ["venda_id"])
    op.create_index("ix_venda_pagamento_forma", "venda_pagamento", ["forma_pagamento"])


def downgrade() -> None:
    op.drop_index("ix_venda_pagamento_forma", table_name="venda_pagamento")
    op.drop_index("ix_venda_pagamento_venda_id", table_name="venda_pagamento")
    op.drop_table("venda_pagamento")
