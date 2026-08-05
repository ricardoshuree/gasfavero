# [mcp-local harness] feature: clientes-precos-vales-e-module-label | plano: 7a1919ed | 2026-08-04 23:23:12
# Adiciona Module.label (nome de exibicao editavel e cosmetico) + seed dos labels dos 9 modulos existentes
# [mcp-local harness] feature: clientes-precos-vales-e-module-label | plano: 7a1919ed
"""gasfavero: Module.label (nome de exibicao editavel, separado do slug)

Revision ID: d3e4f5a6b7c8
Revises: c1d2e3f4a5b6
Create Date: 2026-08-04

ESPECÍFICO DESTE ERP -- NÃO portar pro erp-core-template.

Module.name é o slug técnico (ex: "delegacao") usado literalmente em
`require_module_permission("delegacao")` no código das rotas -- não
pode ser editado livremente sem risco de quebrar alguma rota que
ainda vamos escrever referenciando essa mesma string.

Module.label é só o texto bonito exibido na UI (ex: "Delegação", com
acento) -- 100% cosmético, editável a qualquer momento sem risco.
Se label for NULL, o frontend cai pro fallback (name capitalizado).

Idempotente: adiciona a coluna se não existir, e preenche os labels
dos módulos já existentes só onde ainda estiver NULL.
"""
import sqlalchemy as sa
from alembic import op

revision = "d3e4f5a6b7c8"
down_revision = "c1d2e3f4a5b6"
branch_labels = None
depends_on = None

LABELS = {
    "produtos": "Produtos",
    "usuarios": "Usuários",
    "configuracoes": "Configurações",
    "vendas": "Vendas",
    "clientes": "Clientes",
    "vales": "Vales",
    "inadimplencia": "Inadimplência",
    "delegacao": "Delegação",
    "mapa": "Mapa",
}


def upgrade() -> None:
    bind = op.get_bind()

    inspector = sa.inspect(bind)
    columns = [c["name"] for c in inspector.get_columns("module")]
    if "label" not in columns:
        op.add_column("module", sa.Column("label", sa.String(length=255), nullable=True))

    for name, label in LABELS.items():
        bind.execute(
            sa.text(
                "UPDATE module SET label = :label "
                "WHERE name = :name AND label IS NULL"
            ),
            {"label": label, "name": name},
        )


def downgrade() -> None:
    op.drop_column("module", "label")
