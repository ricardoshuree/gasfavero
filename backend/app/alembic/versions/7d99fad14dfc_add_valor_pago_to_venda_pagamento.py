# [mcp-local harness] feature: baixa_mix_fiado | plano: 3e3bea42 | 2026-09-10 16:18:17
# Migration limpa: só ADD COLUMN valor_pago em venda_pagamento
"""add_valor_pago_to_venda_pagamento

Revision ID: 7d99fad14dfc
Revises: z2a3b4c5d6e7
Create Date: 2026-09-10 16:16:06.829347

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '7d99fad14dfc'
down_revision = 'z2a3b4c5d6e7'
branch_labels = None
depends_on = None


def upgrade():
    # Adiciona valor_pago em venda_pagamento para rastrear pagamentos parciais no mix.
    # server_default='0' permite rodar em tabelas com linhas existentes.
    op.add_column(
        'venda_pagamento',
        sa.Column('valor_pago', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0')
    )
    # Remove o server_default após adicionar a coluna (fica só no model Python)
    op.alter_column('venda_pagamento', 'valor_pago', server_default=None)


def downgrade():
    op.drop_column('venda_pagamento', 'valor_pago')
