# [mcp-local harness] feature: modelo-core-cliente-endereco-preco-vale | plano: c2b109e3 | 2026-08-04 21:59:22
# Migration completa do item 3: cria as 9 tabelas novas + seed de Cidade/Bairro/Rua com o que foi coletado
# [mcp-local harness] feature: modelo-core-cliente-endereco-preco-vale | plano: c2b109e3
"""gasfavero: modelo core (Cliente, geografia, Preco, Vale)

Revision ID: c1d2e3f4a5b6
Revises: b7c8d9e0f1a2
Create Date: 2026-08-04

ESPECÍFICO DESTE ERP (gasfavero) -- NÃO portar pro erp-core-template.

Cria as tabelas do item 3 do plano de requisitos:
    cidade, bairro, rua, endereco      -- geografia (RF-01)
    cliente, cliente_endereco          -- cliente + histórico de endereço (RF-01)
    preco                              -- histórico de vigência de preço (RF-02)
    bloco_vale, vale                   -- bloco de vale + numeração global (RF-03)

Fora do escopo de propósito (adiado): Região/polígono/PostGIS (decisão:
a praça é organizada por bairro, sem desenho de área -- ver item Mapa
quando/se isso mudar) e Venda (interface ainda em discussão -- duas
telas diferentes, distribuidora x motorista).

Seed:
- Cidade "Veranópolis"
- 25 bairros, coletados de https://ruas-brasil.openalfa.com/veranopolis
  (é a lista que o Ricardo indicou como fonte)
- Ruas: SOMENTE um subconjunto pequeno e best-effort, coletado via
  busca (o fetch direto do site foi bloqueado por bot-detection) --
  NÃO é uma lista completa. Bairro "Centro" e "Renovação" têm as ruas
  mais landmark (rodoviária, correios, escolas por perto); os demais
  bairros ficam sem rua pré-cadastrada. Isso é esperado: o cadastro de
  Rua "cresce por uso" -- quando alguém registra o primeiro endereço
  numa rua nova, ela entra pro catálogo daquele bairro dali em diante.
"""
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy import column, table

revision = "c1d2e3f4a5b6"
down_revision = "b7c8d9e0f1a2"
branch_labels = None
depends_on = None


# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------

CIDADE_NOME = "Veranópolis"

BAIRROS = [
    "Barros Cassal", "Centro", "Distrito Industrial", "Esplanada", "Femaçã",
    "Lajeadinho", "Medianeira", "Medianeira 3", "Monte Bérico", "Nelson Picoli",
    "Palugana", "Por do Sol", "Renovação", "Santa Lúcia", "Santa Rita",
    "Santo Antônio", "Santo Isidoro", "Sapopema", "São Francisco",
    "São Francisco do Retiro", "São Gotardo", "São Pelegrino", "Universal",
    "Valverde", "Vila Azul",
]

# Best-effort, NÃO exaustivo -- ver nota no docstring do módulo.
RUAS_POR_BAIRRO: dict[str, list[str]] = {
    "Centro": [
        "Avenida Júlio de Castilhos",
        "Rua Urbano Alves de Moraes",
        "Avenida Ernesto Alves",
        "Rua Padre José",
        "Rua João Missaglia",
        "Rua Princesa Isabel",
        "Avenida Doutor José Montaury",
        "Avenida Osvaldo Aranha",
        "Rua 24 de Maio",
        "Rua Getúlio Vargas",
        "Rua Flores da Cunha",
        "Rua Alfredo Chaves",
    ],
    "Renovação": [
        "Rua Clemente Sachini",
        "Rua Fabiano Reschke",
        "Rua Vereador Geraldo Karmirsck",
        "Rua Júlio Farina",
    ],
    "Medianeira 3": [
        "Rua José Frison",
    ],
}


# ---------------------------------------------------------------------------
# Table helpers (core, pra bulk insert idempotente sem depender do ORM)
# ---------------------------------------------------------------------------

cidade_table = table("cidade", column("id", sa.Uuid()), column("nome", sa.String))
bairro_table = table(
    "bairro",
    column("id", sa.Uuid()),
    column("cidade_id", sa.Uuid()),
    column("nome", sa.String),
)
rua_table = table(
    "rua", column("id", sa.Uuid()), column("bairro_id", sa.Uuid()), column("nome", sa.String)
)


def _scalar_uuid(bind, query: str, params: dict) -> uuid.UUID | None:
    result = bind.execute(sa.text(query), params).scalar()
    if result is None:
        return None
    return result if isinstance(result, uuid.UUID) else uuid.UUID(str(result))


def upgrade() -> None:
    bind = op.get_bind()

    # -------------------------------------------------------------
    # Tabelas
    # -------------------------------------------------------------
    op.create_table(
        "cidade",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("nome", sa.String(length=255), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("nome"),
    )

    op.create_table(
        "bairro",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("cidade_id", sa.Uuid(), nullable=False),
        sa.Column("nome", sa.String(length=255), nullable=False),
        sa.ForeignKeyConstraint(["cidade_id"], ["cidade.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("cidade_id", "nome", name="uq_bairro_cidade_nome"),
    )

    op.create_table(
        "rua",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("bairro_id", sa.Uuid(), nullable=False),
        sa.Column("nome", sa.String(length=255), nullable=False),
        sa.ForeignKeyConstraint(["bairro_id"], ["bairro.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("bairro_id", "nome", name="uq_rua_bairro_nome"),
    )

    op.create_table(
        "endereco",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("rua_id", sa.Uuid(), nullable=False),
        sa.Column("numero", sa.String(length=20), nullable=False),
        sa.Column("complemento", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["rua_id"], ["rua.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "cliente",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("nome", sa.String(length=255), nullable=False),
        sa.Column("cpf", sa.String(length=14), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("cpf"),
    )
    op.create_index("ix_cliente_cpf", "cliente", ["cpf"])

    op.create_table(
        "cliente_endereco",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("cliente_id", sa.Uuid(), nullable=False),
        sa.Column("endereco_id", sa.Uuid(), nullable=False),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("valid_to", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["cliente_id"], ["cliente.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["endereco_id"], ["endereco.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    # Só pode haver 1 linha "vigente" (valid_to NULL) por cliente --
    # índice único parcial, é o banco garantindo a regra de negócio,
    # não só a aplicação.
    op.create_index(
        "uq_cliente_endereco_vigente",
        "cliente_endereco",
        ["cliente_id"],
        unique=True,
        postgresql_where=sa.text("valid_to IS NULL"),
    )

    op.create_table(
        "preco",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("produto_id", sa.Uuid(), nullable=False),
        sa.Column("valor", sa.Numeric(10, 2), nullable=False),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("valid_to", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["produto_id"], ["item.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    # Mesma lógica: só 1 preço vigente por produto ao mesmo tempo.
    op.create_index(
        "uq_preco_vigente",
        "preco",
        ["produto_id"],
        unique=True,
        postgresql_where=sa.text("valid_to IS NULL"),
    )

    op.create_table(
        "bloco_vale",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("motorista_id", sa.Uuid(), nullable=False),
        sa.Column("primeira_folha", sa.Integer(), nullable=False),
        sa.Column("ultima_folha", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["motorista_id"], ["user.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "ultima_folha >= primeira_folha", name="ck_bloco_vale_folhas_ordem"
        ),
    )

    op.create_table(
        "vale",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("bloco_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["bloco_id"], ["bloco_vale.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("numero"),
    )
    op.create_index("ix_vale_numero", "vale", ["numero"])

    # -------------------------------------------------------------
    # Seed: Cidade + Bairros + Ruas (idempotente)
    # -------------------------------------------------------------
    cidade_id = _scalar_uuid(
        bind, "SELECT id FROM cidade WHERE nome = :nome", {"nome": CIDADE_NOME}
    )
    if cidade_id is None:
        cidade_id = uuid.uuid4()
        bind.execute(cidade_table.insert().values(id=cidade_id, nome=CIDADE_NOME))

    bairro_ids: dict[str, uuid.UUID] = {}
    for nome in BAIRROS:
        bairro_id = _scalar_uuid(
            bind,
            "SELECT id FROM bairro WHERE cidade_id = :cidade_id AND nome = :nome",
            {"cidade_id": cidade_id, "nome": nome},
        )
        if bairro_id is None:
            bairro_id = uuid.uuid4()
            bind.execute(
                bairro_table.insert().values(
                    id=bairro_id, cidade_id=cidade_id, nome=nome
                )
            )
        bairro_ids[nome] = bairro_id

    for bairro_nome, ruas in RUAS_POR_BAIRRO.items():
        bairro_id = bairro_ids[bairro_nome]
        for rua_nome in ruas:
            existing = _scalar_uuid(
                bind,
                "SELECT id FROM rua WHERE bairro_id = :bairro_id AND nome = :nome",
                {"bairro_id": bairro_id, "nome": rua_nome},
            )
            if existing is None:
                bind.execute(
                    rua_table.insert().values(
                        id=uuid.uuid4(), bairro_id=bairro_id, nome=rua_nome
                    )
                )


def downgrade() -> None:
    op.drop_index("ix_vale_numero", table_name="vale")
    op.drop_table("vale")
    op.drop_table("bloco_vale")
    op.drop_index("uq_preco_vigente", table_name="preco")
    op.drop_table("preco")
    op.drop_index("uq_cliente_endereco_vigente", table_name="cliente_endereco")
    op.drop_table("cliente_endereco")
    op.drop_index("ix_cliente_cpf", table_name="cliente")
    op.drop_table("cliente")
    op.drop_table("endereco")
    op.drop_table("rua")
    op.drop_table("bairro")
    op.drop_table("cidade")
