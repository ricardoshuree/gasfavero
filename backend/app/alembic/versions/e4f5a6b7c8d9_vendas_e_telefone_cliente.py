# [mcp-local harness] feature: fluxo-vendas-distribuidora | plano: 3f2bec12 | 2026-08-05 10:31:41
# Migration: Cliente.telefone, tabelas venda/venda_item, seed do usuario-sistema Distribuidora Gas Favero
# [mcp-local harness] feature: fluxo-vendas-distribuidora | plano: 3f2bec12
"""gasfavero: Cliente.telefone, Venda/VendaItem, usuario-sistema Distribuidora

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-08-05

ESPECÍFICO DESTE ERP (gasfavero) -- NÃO portar pro erp-core-template.

- Adiciona Cliente.telefone (nullable)
- Cria as tabelas venda e venda_item (venda de balcão da distribuidora)
- Seed idempotente do usuário-sistema "Distribuidora Gás Favero"
  (SISTEMA_DISTRIBUIDORA_EMAIL em app/core/constants.py) -- usado como
  motorista_id padrão em vendas de balcão. is_active=False e senha
  aleatória descartada (essa conta nunca faz login de verdade).
"""
import secrets
import uuid

import sqlalchemy as sa
from alembic import op

revision = "e4f5a6b7c8d9"
down_revision = "d3e4f5a6b7c8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # -------------------------------------------------------------
    # Cliente.telefone
    # -------------------------------------------------------------
    inspector = sa.inspect(bind)
    columns = [c["name"] for c in inspector.get_columns("cliente")]
    if "telefone" not in columns:
        op.add_column(
            "cliente", sa.Column("telefone", sa.String(length=20), nullable=True)
        )

    # -------------------------------------------------------------
    # venda / venda_item
    # -------------------------------------------------------------
    op.create_table(
        "venda",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("cliente_id", sa.Uuid(), nullable=False),
        sa.Column("endereco_id", sa.Uuid(), nullable=True),
        sa.Column("motorista_id", sa.Uuid(), nullable=False),
        sa.Column("forma_pagamento", sa.String(length=20), nullable=False),
        sa.Column("vale_id", sa.Uuid(), nullable=True),
        sa.Column("data_pagamento_vale", sa.Date(), nullable=True),
        sa.Column("valor_total", sa.Numeric(10, 2), nullable=False),
        sa.Column("valor_pago", sa.Numeric(10, 2), nullable=False),
        sa.Column("data_venda", sa.Date(), nullable=False),
        sa.Column("pago_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("criado_por_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["cliente_id"], ["cliente.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["endereco_id"], ["endereco.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["motorista_id"], ["user.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["vale_id"], ["vale.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["criado_por_id"], ["user.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "venda_item",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("venda_id", sa.Uuid(), nullable=False),
        sa.Column("produto_id", sa.Uuid(), nullable=False),
        sa.Column("preco_id", sa.Uuid(), nullable=False),
        sa.Column("quantidade", sa.Integer(), nullable=False),
        sa.Column("subtotal", sa.Numeric(10, 2), nullable=False),
        sa.ForeignKeyConstraint(["venda_id"], ["venda.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["produto_id"], ["item.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["preco_id"], ["preco.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )

    # -------------------------------------------------------------
    # Seed: usuário-sistema "Distribuidora Gás Favero"
    # -------------------------------------------------------------
    # Import local (não no topo do arquivo) -- migrations do Alembic
    # rodam dentro do mesmo ambiente da aplicação, então isso funciona,
    # mas evitamos import pesado no escopo do módulo por convenção.
    from app.core.constants import SISTEMA_DISTRIBUIDORA_EMAIL, SISTEMA_DISTRIBUIDORA_NOME
    from app.core.security import get_password_hash

    existing = bind.execute(
        sa.text("SELECT id FROM \"user\" WHERE email = :email"),
        {"email": SISTEMA_DISTRIBUIDORA_EMAIL},
    ).scalar()

    if existing is None:
        user_table = sa.table(
            "user",
            sa.column("id", sa.Uuid()),
            sa.column("email", sa.String),
            sa.column("hashed_password", sa.String),
            sa.column("is_active", sa.Boolean),
            sa.column("is_superuser", sa.Boolean),
            sa.column("full_name", sa.String),
            sa.column("created_at", sa.DateTime(timezone=True)),
        )
        # Senha aleatória, nunca usada -- essa conta nunca faz login.
        senha_descartavel = secrets.token_urlsafe(32)
        bind.execute(
            user_table.insert().values(
                id=uuid.uuid4(),
                email=SISTEMA_DISTRIBUIDORA_EMAIL,
                hashed_password=get_password_hash(senha_descartavel),
                is_active=False,
                is_superuser=False,
                full_name=SISTEMA_DISTRIBUIDORA_NOME,
            )
        )


def downgrade() -> None:
    from app.core.constants import SISTEMA_DISTRIBUIDORA_EMAIL

    bind = op.get_bind()
    bind.execute(
        sa.text("DELETE FROM \"user\" WHERE email = :email"),
        {"email": SISTEMA_DISTRIBUIDORA_EMAIL},
    )
    op.drop_table("venda_item")
    op.drop_table("venda")
    op.drop_column("cliente", "telefone")
