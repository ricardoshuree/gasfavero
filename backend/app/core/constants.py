# [mcp-local harness] feature: fix-email-sistema-distribuidora | plano: 9943e948 | 2026-08-05 10:54:10
# Corrige o dominio do email do usuario-sistema (nao usar .local)
# [mcp-local harness] feature: fix-email-sistema-distribuidora | plano: 9943e948
"""
Constantes específicas do gasfavero (não fazem parte do
erp-core-template).

SISTEMA_DISTRIBUIDORA_EMAIL identifica o usuário-sistema usado como
`motorista_id` padrão nas vendas de balcão (venda feita na
distribuidora, sem entrega por um motorista de verdade). Esse usuário:

  - É criado uma vez via migration (seed idempotente)
  - Nunca deve poder ser apagado (ver proteção em api/routes/users.py)
  - Nunca faz login de verdade (senha é um valor aleatório, descartado
    na hora -- ninguém precisa saber, ninguém vai usar)
  - is_active=False, reforçando que essa conta não é operacional

IMPORTANTE: o domínio precisa ser um domínio "normal" -- `.local` (e
outros domínios de uso especial reservado, como .test/.invalid/
.localhost) é rejeitado pela validação de e-mail do Pydantic
(EmailStr/email-validator), o que quebra QUALQUER endpoint que
serialize esse usuário (ex: GET /users/ retornava 503 pra lista
inteira). Por isso usamos o domínio real da empresa aqui.
"""

SISTEMA_DISTRIBUIDORA_EMAIL = "distribuidora@sistema.gasfavero.com.br"
SISTEMA_DISTRIBUIDORA_NOME = "Distribuidora Gás Favero"
