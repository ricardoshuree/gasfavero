# [mcp-local harness] feature: fase1-migration-disponivel | plano: f40eab33 | 2026-08-08 11:00:53
# Migration idempotente: user.disponivel boolean NOT NULL DEFAULT true
"""gasfavero: campo disponivel no usuario (disponibilidade do motorista)

Revision ID: k6l7m8n9o0p1
Revises: j5k6l7m8n9o0
Create Date: 2026-08-08

ESPECÍFICO DESTE ERP (gasfavero) -- NÃO portar pro erp-core-template.

Contexto (sessão de mapeamento de cenários com o Ricardo): hoje o
toggle "Disponível/Indisponível" do app do motorista só liga/desliga
o envio de ping de GPS -- não existe nada PERSISTIDO no banco que
diga "esse motorista está disponível agora". Isso impede, por
exemplo, filtrar o combo de motorista na tela /chamado só pra quem
está disponível (cenário: atendente despacha pro Loris, que está sem
sinal/não veio trabalhar -- o chamado fica "atribuído" a alguém que
nunca vai ver).

DEFAULT TRUE de propósito (não false): no dia em que o combo de
/chamado passar a filtrar por este campo, todo usuário existente
(inclusive os que nunca abriram o app do motorista ainda) precisa
continuar aparecendo -- senão o combo fica vazio da noite pro dia e
quebra a operação real da distribuidora. "Indisponível" é uma
escolha ativa que alguém faz (motorista no próprio app, ou gerente
numa tela futura), nunca o padrão de partida.

Campo fica em "user" (não numa tabela nova tipo motorista_localizacao)
porque precisa existir pra QUALQUER usuário desde sempre -- diferente
de localização (só existe depois do primeiro ping de GPS), a
disponibilidade precisa ser algo que já tem um valor mesmo pra quem
nunca usou o app ainda.
"""
import sqlalchemy as sa
from alembic import op

revision = "k6l7m8n9o0p1"
down_revision = "j5k6l7m8n9o0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    colunas_user = {col["name"] for col in inspector.get_columns("user")}

    if "disponivel" not in colunas_user:
        op.add_column(
            "user",
            sa.Column(
                "disponivel",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            ),
        )


def downgrade() -> None:
    op.drop_column("user", "disponivel")
