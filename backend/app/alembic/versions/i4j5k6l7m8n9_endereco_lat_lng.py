# [mcp-local harness] feature: delegacao-venda-fase2-geocoding | plano: 0144c501 | 2026-08-06 20:15:49
# Migration idempotente que adiciona latitude/longitude nullable em endereco
"""gasfavero: latitude/longitude em endereco (delegacao fase 2 - geocodificacao)

Revision ID: i4j5k6l7m8n9
Revises: h3i4j5k6l7m8
Create Date: 2026-08-06

ESPECÍFICO DESTE ERP (gasfavero) -- NÃO portar pro erp-core-template.

Fase 2 da Delegação de Venda: adiciona colunas latitude/longitude
(nullable) na tabela endereco, preenchidas via Google Geocoding API
(ver app/core/geocoding.py) no momento da criação de cada endereço.

Endereços já existentes no banco (cadastrados antes desta migration)
ficam com latitude/longitude NULL -- não há geocodificação retroativa
automática aqui de propósito (evitaria gastar cota da API numa
migration, que não é o lugar certo pra isso). Retry manual disponível
via POST /enderecos/{id}/geocodificar pra cobrir esses casos um a um,
se/quando fizer sentido.
"""
import sqlalchemy as sa
from alembic import op

revision = "i4j5k6l7m8n9"
down_revision = "h3i4j5k6l7m8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    colunas_existentes = {col["name"] for col in inspector.get_columns("endereco")}

    if "latitude" not in colunas_existentes:
        op.add_column(
            "endereco", sa.Column("latitude", sa.Numeric(9, 6), nullable=True)
        )
    if "longitude" not in colunas_existentes:
        op.add_column(
            "endereco", sa.Column("longitude", sa.Numeric(9, 6), nullable=True)
        )


def downgrade() -> None:
    op.drop_column("endereco", "longitude")
    op.drop_column("endereco", "latitude")
