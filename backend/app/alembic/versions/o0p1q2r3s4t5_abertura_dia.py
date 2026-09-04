# [mcp-local harness] feature: abertura-dia | plano: 8346bf80 | 2026-09-04 15:10:39
# Cria tabela abertura_dia com unique por motorista/data e módulo RBAC fechamento
"""gasfavero: tabela abertura_dia + modulo RBAC fechamento (Fase 2)

Revision ID: o0p1q2r3s4t5
Revises: n9o0p1q2r3s4
Create Date: 2026-09-04

AberturaDia registra o despacho de cada motorista no inicio do dia:
- Uma abertura por motorista por dia (unique constraint)
- Gera lancamento contabil: D Conta Mestre / C Caixa em Transito do motorista
- Edicao posterior gera lancamento de ajuste (diferenca), nunca estorna
- Somente gerente (modulo 'fechamento', can_create) pode abrir/editar

Tambem cria (se nao existir) a conta de Caixa em Transito individual
do motorista sob a conta sintetica 1100, numerada sequencialmente
(1101, 1102, ...) na primeira abertura dele.

Modulo RBAC 'fechamento' criado com label 'Fechamento Diario'.
"""
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision = "o0p1q2r3s4t5"
down_revision = "n9o0p1q2r3s4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "abertura_dia",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("motorista_id", UUID(as_uuid=False), sa.ForeignKey("user.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("fundo_troco", sa.Numeric(10, 2), nullable=False),
        sa.Column("aberto_por_id", UUID(as_uuid=False), sa.ForeignKey("user.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("editado_por_id", UUID(as_uuid=False), sa.ForeignKey("user.id", ondelete="RESTRICT"), nullable=True),
        # garante uma abertura por motorista por dia
        sa.UniqueConstraint("motorista_id", "data", name="uq_abertura_motorista_data"),
    )

    # modulo RBAC fechamento
    bind = op.get_bind()
    modulo_existente = bind.execute(
        sa.text("SELECT id FROM module WHERE name = 'fechamento'")
    ).fetchone()

    if not modulo_existente:
        import uuid
        modulo_id = str(uuid.uuid4())
        bind.execute(sa.text(
            f"INSERT INTO module (id, name, label, description) "
            f"VALUES ('{modulo_id}', 'fechamento', 'Fechamento Diario', "
            f"'Abertura e fechamento diario do malote por motorista')"
        ))


def downgrade() -> None:
    op.drop_table("abertura_dia")
    op.execute("DELETE FROM module WHERE name = 'fechamento'")
