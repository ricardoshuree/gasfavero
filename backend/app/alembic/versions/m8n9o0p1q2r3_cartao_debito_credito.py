# [mcp-local harness] feature: cartao-debito-credito | plano: 85b9b898 | 2026-09-04 13:51:06
# Migration que converte registros antigos com forma_pagamento='cartao' para 'cartao_debito'
"""gasfavero: separar forma_pagamento cartao em cartao_debito e cartao_credito

Revision ID: m8n9o0p1q2r3
Revises: l7m8n9o0p1q2
Create Date: 2026-09-04

Converte registros existentes com forma_pagamento='cartao' para
'cartao_debito' -- decisão do Ricardo: todos os dados existentes são
fakes, não há impacto real. A partir desta migration o sistema aceita
'cartao_debito' e 'cartao_credito' como formas de pagamento válidas;
o valor antigo 'cartao' não é mais produzido por nenhum fluxo novo.
"""
from alembic import op

revision = "m8n9o0p1q2r3"
down_revision = "l7m8n9o0p1q2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE venda SET forma_pagamento = 'cartao_debito' "
        "WHERE forma_pagamento = 'cartao'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE venda SET forma_pagamento = 'cartao' "
        "WHERE forma_pagamento IN ('cartao_debito', 'cartao_credito')"
    )
