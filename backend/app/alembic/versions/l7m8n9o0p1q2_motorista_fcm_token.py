# [mcp-local harness] feature: fcm-backend | plano: 82950fd0 | 2026-08-09 14:20:12
# Migration para adicionar coluna fcm_token na tabela user
# [mcp-local harness] feature: fcm-backend | plano: 82950fd0 | 2026-08-09
# Migration idempotente: user.fcm_token varchar(255) nullable
"""gasfavero: campo fcm_token no usuario (push notification real via FCM)

Revision ID: l7m8n9o0p1q2
Revises: k6l7m8n9o0p1
Create Date: 2026-08-09

ESPECÍFICO DESTE ERP (gasfavero) -- NÃO portar pro erp-core-template.

Guarda o token FCM atual do aparelho do motorista, pra permitir push
notification real (alerta com o app fechado/minimizado) -- ver
comentário completo na classe User em models.py e em
app/core/firebase_push.py. NULLABLE de propósito (sem server_default):
diferente de `disponivel` (que precisa de um valor sensato desde
sempre pra não quebrar o combo de despacho), aqui NULL é um estado
válido e esperado -- "esse motorista ainda não abriu o app depois
desta feature existir, ou nunca teve push configurado". Nesse caso o
envio de push simplesmente não acontece pra ele (best-effort, ver
firebase_push.py) -- ele continua recebendo chamado normalmente via
polling, só não ganha o alerta com o app fechado.
"""
import sqlalchemy as sa
from alembic import op

revision = "l7m8n9o0p1q2"
down_revision = "k6l7m8n9o0p1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    colunas_user = {col["name"] for col in inspector.get_columns("user")}

    if "fcm_token" not in colunas_user:
        op.add_column(
            "user",
            sa.Column("fcm_token", sa.String(length=255), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("user", "fcm_token")
