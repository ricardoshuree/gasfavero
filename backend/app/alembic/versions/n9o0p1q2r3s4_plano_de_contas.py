# [mcp-local harness] feature: plano-de-contas-fix2 | plano: f9feb18f | 2026-09-04 14:52:20
# Seed com INSERT SQL puro inline — sem sa.text parametrizado para evitar conflito com cast UUID do psycopg
"""gasfavero: plano de contas contabil + lancamentos (Fase 1 fechamento diario)

Revision ID: n9o0p1q2r3s4
Revises: m8n9o0p1q2r3
Create Date: 2026-09-04

Cria o plano de contas fixo seguindo o padrao contabil brasileiro
(1xxx ativo, 2xxx receita, 3xxx despesa) e a tabela de lancamentos
contabeis de partidas dobradas.

Contas criadas pelo seed desta migration:
  1000 - Distribuidora Gas Favero       (conta mestre / sintetica)
  1100 - Caixa em Transito              (sintetica - filhos por motorista)
  1200 - Contas a Receber - Fiado       (analitica)
  1300 - Maquininha - Cartao a Liquidar (analitica)
  2000 - Receitas                       (sintetica)
  2100 - Receitas - Vendas a Vista      (analitica)
  2200 - Receitas - Vendas no Fiado     (analitica)
  3000 - Despesas                       (sintetica)
  3100 - Quebra de Caixa                (analitica)
  3200 - Sobra de Caixa                 (analitica)
  3300 - Taxas de Cartao                (analitica)

Contas de Caixa em Transito por motorista (1101, 1102, ...) sao criadas
dinamicamente na abertura do dia -- nao fazem parte deste seed.
"""
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision = "n9o0p1q2r3s4"
down_revision = "m8n9o0p1q2r3"
branch_labels = None
depends_on = None

CONTA_MESTRE         = "10000000-0000-0000-0000-000000000001"
CONTA_TRANSITO       = "11000000-0000-0000-0000-000000000001"
CONTA_FIADO          = "12000000-0000-0000-0000-000000000001"
CONTA_MAQUININHA     = "13000000-0000-0000-0000-000000000001"
CONTA_RECEITAS       = "20000000-0000-0000-0000-000000000001"
CONTA_RECEITA_VISTA  = "21000000-0000-0000-0000-000000000001"
CONTA_RECEITA_FIADO  = "22000000-0000-0000-0000-000000000001"
CONTA_DESPESAS       = "30000000-0000-0000-0000-000000000001"
CONTA_QUEBRA         = "31000000-0000-0000-0000-000000000001"
CONTA_SOBRA          = "32000000-0000-0000-0000-000000000001"
CONTA_TAXA_CARTAO    = "33000000-0000-0000-0000-000000000001"


def upgrade() -> None:
    op.create_table(
        "conta",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("numero", sa.String(10), nullable=False, unique=True),
        sa.Column("nome", sa.String(255), nullable=False),
        sa.Column("tipo", sa.String(20), nullable=False),
        sa.Column("pai_id", UUID(as_uuid=False), sa.ForeignKey("conta.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("motorista_id", UUID(as_uuid=False), sa.ForeignKey("user.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "lancamento_contabil",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("descricao", sa.String(500), nullable=False),
        sa.Column("valor", sa.Numeric(10, 2), nullable=False),
        sa.Column("debito_id", UUID(as_uuid=False), sa.ForeignKey("conta.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("credito_id", UUID(as_uuid=False), sa.ForeignKey("conta.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("venda_id", UUID(as_uuid=False), sa.ForeignKey("venda.id", ondelete="SET NULL"), nullable=True),
        sa.Column("abertura_id", UUID(as_uuid=False), nullable=True),
        sa.Column("criado_por_id", UUID(as_uuid=False), sa.ForeignKey("user.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # Seed via INSERT direto com SQL puro -- sem sa.text() parametrizado
    # para evitar conflito entre o placeholder :param do SQLAlchemy e o
    # cast ::uuid do Postgres (psycopg interpreta :param::uuid como erro).
    bind = op.get_bind()

    contas = [
        # (id, numero, nome, tipo, pai_id)
        (CONTA_MESTRE,        "1000", "Distribuidora Gas Favero",       "sintetica", "NULL"),
        (CONTA_RECEITAS,      "2000", "Receitas",                        "sintetica", "NULL"),
        (CONTA_DESPESAS,      "3000", "Despesas",                        "sintetica", "NULL"),
        (CONTA_TRANSITO,      "1100", "Caixa em Transito",              "sintetica", f"'{CONTA_MESTRE}'"),
        (CONTA_FIADO,         "1200", "Contas a Receber - Fiado",       "analitica", f"'{CONTA_MESTRE}'"),
        (CONTA_MAQUININHA,    "1300", "Maquininha - Cartao a Liquidar", "analitica", f"'{CONTA_MESTRE}'"),
        (CONTA_RECEITA_VISTA, "2100", "Receitas - Vendas a Vista",      "analitica", f"'{CONTA_RECEITAS}'"),
        (CONTA_RECEITA_FIADO, "2200", "Receitas - Vendas no Fiado",     "analitica", f"'{CONTA_RECEITAS}'"),
        (CONTA_QUEBRA,        "3100", "Quebra de Caixa",                "analitica", f"'{CONTA_DESPESAS}'"),
        (CONTA_SOBRA,         "3200", "Sobra de Caixa",                 "analitica", f"'{CONTA_DESPESAS}'"),
        (CONTA_TAXA_CARTAO,   "3300", "Taxas de Cartao",                "analitica", f"'{CONTA_DESPESAS}'"),
    ]

    for conta_id, numero, nome, tipo, pai_expr in contas:
        bind.execute(sa.text(
            f"INSERT INTO conta (id, numero, nome, tipo, pai_id, motorista_id, ativo, created_at) "
            f"VALUES ('{conta_id}', '{numero}', '{nome}', '{tipo}', {pai_expr}, NULL, true, NOW()) "
            f"ON CONFLICT (id) DO NOTHING"
        ))


def downgrade() -> None:
    op.execute("DELETE FROM lancamento_contabil")
    op.execute("DELETE FROM conta")
    op.drop_table("lancamento_contabil")
    op.drop_table("conta")
