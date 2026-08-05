# [mcp-local harness] feature: fluxo-vendas-distribuidora | plano: 7648b79a | 2026-08-05 10:31:19
# Constantes do usuario-sistema Distribuidora Gas Favero
# [mcp-local harness] feature: fluxo-vendas-distribuidora | plano: 7648b79a
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
"""

SISTEMA_DISTRIBUIDORA_EMAIL = "distribuidora@sistema.gasfavero.local"
SISTEMA_DISTRIBUIDORA_NOME = "Distribuidora Gás Favero"
