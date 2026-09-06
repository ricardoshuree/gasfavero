# [mcp-local harness] feature: gas-povo | plano: 8ec9cbb7 | 2026-09-06 00:02:02
# Migration: adiciona gas_povo_frete e gas_povo_frete_recebido_em na tabela venda
"""gasfavero: campos gas_povo na venda

Revision ID: u6v7w8x9y0z1
Revises: t5u6v7w8x9y0
Create Date: 2026-09-06

Adiciona dois campos na tabela venda para suportar a forma de pagamento
"gas_povo" (Programa Gas do Povo):
  - gas_povo_frete: valor do frete cobrado do cliente no ato da entrega
  - gas_povo_frete_recebido_em: timestamp de quando o frete foi recebido
    (preenchido automaticamente na criacao da venda, pois o frete e pago
    pelo cliente no ato)

O pagamento do governo (valor principal) e rastreado via pago_em existente.
"""
import sqlalchemy as sa
from alembic import op

revision = "u6v7w8x9y0z1"
down_revision = "t5u6v7w8x9y0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE venda ADD COLUMN IF NOT EXISTS "
        "gas_povo_frete NUMERIC(10,2)"
    )
    op.execute(
        "ALTER TABLE venda ADD COLUMN IF NOT EXISTS "
        "gas_povo_frete_recebido_em TIMESTAMPTZ"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE venda DROP COLUMN IF EXISTS gas_povo_frete")
    op.execute("ALTER TABLE venda DROP COLUMN IF EXISTS gas_povo_frete_recebido_em")
