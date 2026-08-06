# [mcp-local harness] feature: delegacao-venda-fase1 | plano: fd600824 | 2026-08-06 18:26:20
# Migration idempotente que cria as tabelas demanda_venda e motorista_localizacao (Fase 1 da Delegação de Venda)
"""gasfavero: demanda de venda + localizacao de motorista (delegacao fase 1)

Revision ID: h3i4j5k6l7m8
Revises: g2h3i4j5k6l7
Create Date: 2026-08-06

ESPECÍFICO DESTE ERP (gasfavero) -- NÃO portar pro erp-core-template.

Fase 1 da Delegação de Venda (item 10 dos requisitos do Giovani
Favero): só a espinha dorsal de dados, sem push/mapa/app ainda.

demanda_venda -- despacho de uma demanda de venda pro motorista
escolhido pelo atendente. endereco_id é NOT NULL e sempre aponta pra
um Endereco real já cadastrado -- decisão confirmada com o Ricardo,
nunca texto livre, porque sem endereço estruturado não dá pra
geocodificar/plotar no mapa nas fases seguintes (2 e 3). status é
string livre (pendente/aceita/recusada, validado no Pydantic da API),
mesmo padrão já usado em venda.forma_pagamento.

motorista_localizacao -- upsert puro, 1 linha por motorista
(motorista_id é a própria PK, sem id próprio). Cada ping de
localização SOBRESCREVE a linha existente -- decisão confirmada:
não guardamos histórico de localização, não interessa pro negócio e
evita crescimento de tabela sem necessidade.
"""
import sqlalchemy as sa
from alembic import op

revision = "h3i4j5k6l7m8"
down_revision = "g2h3i4j5k6l7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "demanda_venda" not in existing_tables:
        op.create_table(
            "demanda_venda",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("cliente_id", sa.Uuid(), nullable=False),
            sa.Column("endereco_id", sa.Uuid(), nullable=False),
            sa.Column("motorista_id", sa.Uuid(), nullable=False),
            sa.Column("observacao", sa.String(length=500), nullable=True),
            sa.Column(
                "status", sa.String(length=20), nullable=False, server_default="pendente"
            ),
            sa.Column("criado_por_id", sa.Uuid(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("respondida_em", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["cliente_id"], ["cliente.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["endereco_id"], ["endereco.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["motorista_id"], ["user.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["criado_por_id"], ["user.id"], ondelete="RESTRICT"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_demanda_venda_motorista_id", "demanda_venda", ["motorista_id"]
        )
        op.create_index("ix_demanda_venda_status", "demanda_venda", ["status"])

    if "motorista_localizacao" not in existing_tables:
        op.create_table(
            "motorista_localizacao",
            sa.Column("motorista_id", sa.Uuid(), nullable=False),
            sa.Column("latitude", sa.Numeric(9, 6), nullable=False),
            sa.Column("longitude", sa.Numeric(9, 6), nullable=False),
            sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(
                ["motorista_id"], ["user.id"], ondelete="CASCADE"
            ),
            sa.PrimaryKeyConstraint("motorista_id"),
        )


def downgrade() -> None:
    op.drop_table("motorista_localizacao")
    op.drop_index("ix_demanda_venda_status", table_name="demanda_venda")
    op.drop_index("ix_demanda_venda_motorista_id", table_name="demanda_venda")
    op.drop_table("demanda_venda")
