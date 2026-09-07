# [mcp-local harness] feature: emprestimo_casco | plano: 1c0b80ad | 2026-09-07 15:07:55
# Migration: cria tabela emprestimo_casco com dupla checagem (recebido_em + confirmado_em)
"""gasfavero: emprestimo de casco de botijao

Revision ID: w8x9y0z1a2b3
Revises: v7w8x9y0z1a2
Create Date: 2026-09-07

Cria tabela emprestimo_casco para controle de cascos emprestados ao cliente na venda.

Fluxo operacional:
  1. Venda criada com cascos emprestados -> registros em emprestimo_casco (recebido_em=NULL)
  2. Motorista ou gerente registra devolução física -> recebido_em preenchido
  3. Gerente confirma devolução (dupla checagem) -> confirmado_em preenchido

Campos:
  - venda_id: FK para venda onde o casco foi emprestado
  - produto_id: FK para item (produto/botijao)
  - quantidade: quantos cascos foram emprestados
  - motorista_id: quem fez a venda/emprestou
  - cliente_id: denormalizado para consultas rápidas
  - recebido_em: preenchido pelo motorista ou gerente ao receber o casco fisicamente
  - recebido_por_id: quem registrou a devolução
  - confirmado_em: preenchido pelo gerente como baixa formal (dupla checagem)
  - confirmado_por_id: gerente que confirmou
"""
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision = "w8x9y0z1a2b3"
down_revision = "v7w8x9y0z1a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "emprestimo_casco",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column(
            "venda_id", UUID(as_uuid=False),
            sa.ForeignKey("venda.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "produto_id", UUID(as_uuid=False),
            sa.ForeignKey("item.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("quantidade", sa.Integer(), nullable=False),
        sa.Column(
            "motorista_id", UUID(as_uuid=False),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "cliente_id", UUID(as_uuid=False),
            sa.ForeignKey("cliente.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("recebido_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "recebido_por_id", UUID(as_uuid=False),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("confirmado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "confirmado_por_id", UUID(as_uuid=False),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_index("ix_emprestimo_casco_cliente_id", "emprestimo_casco", ["cliente_id"])
    op.create_index("ix_emprestimo_casco_venda_id", "emprestimo_casco", ["venda_id"])
    op.create_index("ix_emprestimo_casco_recebido_em", "emprestimo_casco", ["recebido_em"])


def downgrade() -> None:
    op.drop_index("ix_emprestimo_casco_recebido_em", "emprestimo_casco")
    op.drop_index("ix_emprestimo_casco_venda_id", "emprestimo_casco")
    op.drop_index("ix_emprestimo_casco_cliente_id", "emprestimo_casco")
    op.drop_table("emprestimo_casco")
