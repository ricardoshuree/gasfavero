# [mcp-local harness] feature: chamado-modelo-dados | plano: 6d2bc5c1 | 2026-08-07 07:42:42
# Migration: motorista_id nullable, finalizada_em, tabela demanda_venda_item
"""gasfavero: chamado - motorista opcional, itens, conclusao

Revision ID: j5k6l7m8n9o0
Revises: i4j5k6l7m8n9
Create Date: 2026-08-07

ESPECÍFICO DESTE ERP (gasfavero) -- NÃO portar pro erp-core-template.

Evolução do modelo de "Demanda de Venda" (Fase 1) pro "Chamado"
(nome de exibição combinado com o Ricardo):

1. demanda_venda.motorista_id vira NULLABLE -- NULL agora significa
   "chamado aberto, disponível pra qualquer motorista aceitar"
   (decisão confirmada: sem conceito de motorista "disponível"
   ainda, "despachar pra todos" é literalmente "sem dono até alguém
   aceitar").

2. demanda_venda ganha finalizada_em (nullable) -- preenchido quando
   o motorista marca "cheguei ao destino" (status vira 'concluida'),
   momento que encerra o chamado de vez.

3. Nova tabela demanda_venda_item -- produtos que o motorista precisa
   levar (produto_id + quantidade, SEM preco -- a venda de verdade,
   com preço vigente, acontece depois na tela de Vendas).
"""
import sqlalchemy as sa
from alembic import op

revision = "j5k6l7m8n9o0"
down_revision = "i4j5k6l7m8n9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    colunas_demanda = {
        col["name"] for col in inspector.get_columns("demanda_venda")
    }

    if "motorista_id" in colunas_demanda:
        # drop + recria a coluna como nullable -- alembic/postgres não
        # tem um "alter column drop not null" direto via op genérico
        # simples o suficiente aqui; usamos alter_column explícito.
        op.alter_column(
            "demanda_venda",
            "motorista_id",
            existing_type=sa.Uuid(),
            nullable=True,
        )

    if "finalizada_em" not in colunas_demanda:
        op.add_column(
            "demanda_venda",
            sa.Column("finalizada_em", sa.DateTime(timezone=True), nullable=True),
        )

    existing_tables = set(inspector.get_table_names())
    if "demanda_venda_item" not in existing_tables:
        op.create_table(
            "demanda_venda_item",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("demanda_id", sa.Uuid(), nullable=False),
            sa.Column("produto_id", sa.Uuid(), nullable=False),
            sa.Column("quantidade", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(
                ["demanda_id"], ["demanda_venda.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(
                ["produto_id"], ["item.id"], ondelete="RESTRICT"
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_demanda_venda_item_demanda_id",
            "demanda_venda_item",
            ["demanda_id"],
        )


def downgrade() -> None:
    op.drop_index(
        "ix_demanda_venda_item_demanda_id", table_name="demanda_venda_item"
    )
    op.drop_table("demanda_venda_item")
    op.drop_column("demanda_venda", "finalizada_em")
    op.alter_column(
        "demanda_venda",
        "motorista_id",
        existing_type=sa.Uuid(),
        nullable=False,
    )
