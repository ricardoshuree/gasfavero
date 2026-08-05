# [mcp-local harness] feature: recebimento-vale-backend | plano: 47227254 | 2026-08-05 15:29:06
# Migration: adiciona Venda.recebido_em e Venda.recebido_por_id
"""gasfavero: Venda.recebido_em + recebido_por_id (recebimento de vale)

Revision ID: a7b8c9d0e1f2
Revises: f5a6b7c8d9e0
Create Date: 2026-08-05

ESPECÍFICO DESTE ERP (gasfavero) -- NÃO portar pro erp-core-template.

Tela "Recebimento de Vale": introduz um estado intermediário entre
"venda em aberto" e "baixada" (pago_em). `recebido_em` marca o
momento em que alguém (hoje: o operador na distribuidora; no futuro:
o motorista em campo) confirma ter recebido o pagamento -- mas isso
ainda não fecha a venda, só move ela pra fila "aguardando baixa".
Só a baixa (endpoint separado, sempre feita na distribuidora) grava
`pago_em` de verdade, e só quando o valor pago atinge o valor_total.

`recebido_por_id` é só rastreabilidade (quem marcou como pago) --
ondelete=SET NULL porque isso é auditoria, não deve nunca bloquear a
exclusão de um usuário nem apagar o registro da venda.
"""
import sqlalchemy as sa
from alembic import op

revision = "a7b8c9d0e1f2"
down_revision = "f5a6b7c8d9e0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "venda",
        sa.Column("recebido_em", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "venda",
        sa.Column("recebido_por_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_venda_recebido_por_id_user",
        "venda",
        "user",
        ["recebido_por_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_venda_recebido_por_id_user", "venda", type_="foreignkey")
    op.drop_column("venda", "recebido_por_id")
    op.drop_column("venda", "recebido_em")
