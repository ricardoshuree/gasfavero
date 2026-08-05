# [mcp-local harness] feature: fix-email-sistema-distribuidora | plano: 9943e948 | 2026-08-05 10:54:20
# Migration idempotente que corrige o email do usuario-sistema ja inserido
# [mcp-local harness] feature: fix-email-sistema-distribuidora | plano: 9943e948
"""gasfavero: fix email do usuario-sistema Distribuidora (nao usar .local)

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
Create Date: 2026-08-05

ESPECÍFICO DESTE ERP -- NÃO portar pro erp-core-template.

A migration anterior (e4f5a6b7c8d9) criou o usuário-sistema
"Distribuidora Gás Favero" com email
distribuidora@sistema.gasfavero.local -- domínio .local é reservado
(uso especial / mDNS) e a validação de e-mail do Pydantic
(EmailStr/email-validator) rejeita esse domínio na hora de
serializar a resposta, quebrando GET /users/ (503) sempre que esse
usuário aparecia na lista completa.

Esta migration só corrige o e-mail da linha já inserida (idempotente:
só atualiza se ainda estiver com o e-mail antigo).
"""
import sqlalchemy as sa
from alembic import op

revision = "f5a6b7c8d9e0"
down_revision = "e4f5a6b7c8d9"
branch_labels = None
depends_on = None

EMAIL_ANTIGO = "distribuidora@sistema.gasfavero.local"
EMAIL_NOVO = "distribuidora@sistema.gasfavero.com.br"


def upgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text('UPDATE "user" SET email = :novo WHERE email = :antigo'),
        {"novo": EMAIL_NOVO, "antigo": EMAIL_ANTIGO},
    )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text('UPDATE "user" SET email = :antigo WHERE email = :novo'),
        {"novo": EMAIL_NOVO, "antigo": EMAIL_ANTIGO},
    )
