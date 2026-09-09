# [mcp-local harness] feature: venda_casco_produto | plano: cf97808c | 2026-09-09 11:42:33
# Migration: vende_casco em item, preco_casco em preco, com_casco + preco_casco_snapshot em venda_item
"""gasfavero: venda de casco junto ao produto

Revision ID: y1z2a3b4c5d6
Revises: x9y0z1a2b3c4
Create Date: 2026-09-09

Alterações:
  - item.vende_casco (bool, default false): produto permite venda de casco
  - preco.preco_casco (Numeric 10,2, nullable): preço do casco nesta vigência
  - venda_item.com_casco (bool, default false): item foi vendido com casco
  - venda_item.preco_casco_snapshot (Numeric 10,2, nullable): valor do casco no momento da venda
"""
import sqlalchemy as sa
from alembic import op

revision = "y1z2a3b4c5d6"
down_revision = "x9y0z1a2b3c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("item", sa.Column("vende_casco", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("preco", sa.Column("preco_casco", sa.Numeric(10, 2), nullable=True))
    op.add_column("venda_item", sa.Column("com_casco", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("venda_item", sa.Column("preco_casco_snapshot", sa.Numeric(10, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("venda_item", "preco_casco_snapshot")
    op.drop_column("venda_item", "com_casco")
    op.drop_column("preco", "preco_casco")
    op.drop_column("item", "vende_casco")
