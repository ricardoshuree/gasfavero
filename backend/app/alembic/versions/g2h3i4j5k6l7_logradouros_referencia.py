# [mcp-local harness] feature: logradouros-referencia-autocomplete | plano: e54cf24d | 2026-08-06 15:39:39
# Migration idempotente que cria a tabela logradouro_referencia e insere os 239 nomes de rua
"""gasfavero: catalogo de logradouros de referencia

Revision ID: g2h3i4j5k6l7
Revises: f1a2b3c4d5e6
Create Date: 2026-08-06

ESPECÍFICO DESTE ERP (gasfavero) -- NÃO portar pro erp-core-template.

Cria a tabela logradouro_referencia -- catálogo de nomes de rua
conhecidos de Veranópolis (fonte: lista pública de logradouros da
cidade), DELIBERADAMENTE sem vínculo a bairro. Tentativas de associar
rua->bairro via Google Maps e Correios (busca CEP) não deram resultado
confiável pra essa cidade (ver conversa com o Ricardo) -- Correios só
tem CEP individual pra meia dúzia de logradouros centrais, o resto
cai no CEP genérico do município.

Usado só como fonte extra de sugestão no autocomplete de endereço
(GET /bairros/logradouros-referencia) -- não afeta em nada a tabela
Rua (que continua "crescendo por uso", bairro-scoped).

Idempotente: insere só os nomes que ainda não existem (by nome),
seguro rodar de novo.
"""
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy import column, table

revision = "g2h3i4j5k6l7"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


logradouro_referencia_table = table(
    "logradouro_referencia",
    column("id", sa.Uuid()),
    column("nome", sa.String),
)

NOMES = [
    "Alameda Santos Dumont",
    "Avenida Doutor José Montaury",
    "Avenida Ernesto Alves",
    "Avenida Júlio de Castilhos",
    "Avenida Júlio de Oliveira",
    "Avenida Osvaldo Aranha",
    "Avenida Pinheiro Machado",
    "Beco do Gatti",
    "Cofava",
    "Estrada da Balsa",
    "Estrada Geral Nelson Picoli",
    "Estrada Geral Santa Bárbara",
    "Estrada Linha Tiradentes",
    "Estrada Nossa Senhora das Dores",
    "Estrada para Coreia",
    "Estrada para Linha República",
    "Estrada para Nossa Senhora das Dores",
    "Estrada Velha da Vacaria",
    "Monte Bérico",
    "Rodovia Prefeito Nadyr Peruffo",
    "Rua 1",
    "Rua 2",
    "Rua 24 de Maio",
    "Rua 4",
    "Rua 5",
    "Rua A",
    "Rua A. Lima",
    "Rua Acre",
    "Rua Adelino Orso",
    "Rua Adolpho Sassi",
    "Rua Adriano Farina",
    "Rua Afonso Pena",
    "Rua Alagoas",
    "Rua Albano Souza",
    "Rua Alberto Pasqualini",
    "Rua Aleixo Sfreddo",
    "Rua Aleixo Sfredo",
    "Rua Alexandrina Gradaschi Pessin",
    "Rua Alfredo Chaves",
    "Rua Alsemiro Laurino Guzzo",
    "Rua Amazonas",
    "Rua Andrade Neves",
    "Rua Antônio David Farina",
    "Rua Antônio Tedesco Filho",
    "Rua Arduino Ruvilio Boito",
    "Rua Argelindo Dall'Agnol",
    "Rua Arlindo Caser",
    "Rua Armando Gazzana",
    "Rua Armelindo Miguel Peruzzo",
    "Rua Arthur Bernardes",
    "Rua Augusto Alexandre Perachi",
    "Rua Avelino Antônio Mazzarolo",
    "Rua Avelino Ferdinando Chiaradia",
    "Rua Avelino Tomasetto",
    "Rua Bahia",
    "Rua Barão do Rio Branco",
    "Rua Benjamin Constant",
    "Rua Bento Gonçalves da Silva",
    "Rua Bento Machado",
    "Rua Borges de Medeiros",
    "Rua Bortolo Rampazzo",
    "Rua Buarque de Macedo",
    "Rua C",
    "Rua Campos Sales",
    "Rua Capitão Manoel Campos Salvaterra",
    "Rua Capitão Pelegrino Guzzo",
    "Rua Cardenio João Boff",
    "Rua Carlos Barbosa",
    "Rua Carlos de Azevedo",
    "Rua Carlos Felipe Saretta",
    "Rua Carlos Mario Schmitz",
    "Rua Casemiro Eco",
    "Rua Castron Alves",
    "Rua Ceará",
    "Rua Cilon Cagliari",
    "Rua Clemente Sachini",
    "Rua Clóvis Moreschi",
    "Rua Coronel Achiles de Rezende",
    "Rua Coronel Manoel Pontes Filho",
    "Rua César Diniz Tedesco",
    "Rua Deputado Astério de Mello",
    "Rua Domingos José Farina",
    "Rua Dona Clara Schimitz",
    "Rua Dorival Borba de Freitas",
    "Rua Doutor Henrique Biasino",
    "Rua Doutor Idemundo Tedesco",
    "Rua Duque de Caxias",
    "Rua Décio Fernandes Pessato",
    "Rua E",
    "Rua Eduardo Duarte",
    "Rua Eduardo Reginato",
    "Rua Elígio Parise",
    "Rua Emílio Priotto",
    "Rua Epitácio Pessoa",
    "Rua Ernesto Alves",
    "Rua F",
    "Rua Fabiano Reschke",
    "Rua Fioravante Bofi",
    "Rua Fiorello Albino Barbieri",
    "Rua Fiorelo H Chiaradia",
    "Rua Fiorelo Sebben",
    "Rua Fiorindo Dalla Coleta",
    "Rua Fiovarante Pessin",
    "Rua Francisco Luiz Triches",
    "Rua Frederico Spasin",
    "Rua Frei Dionísio Veronese",
    "Rua Frei Inácio Curtarelli",
    "Rua Gaspar Vieira Pimentel",
    "Rua General Flores da Cunha",
    "Rua Getúlio Vargas",
    "Rua Giocondo Toschi",
    "Rua Giulio del Prete",
    "Rua Giuseppe Garibaldi",
    "Rua Glória Gasparin Fin",
    "Rua Goiás",
    "Rua Gomercindo Carlos Roehe",
    "Rua Guilherme Giugno",
    "Rua Guilherme Vitório Frainer",
    "Rua H",
    "Rua Heriberto Pedro Ledur",
    "Rua Herlinge",
    "Rua Hermes Faccin",
    "Rua Idalina Costa Bernardi",
    "Rua Ignácio Frainer",
    "Rua Inézio Domingos Zanchetta",
    "Rua Irany Nebel Guzzo",
    "Rua Irmã Filomena Fin",
    "Rua Irmão Fernando",
    "Rua Irmão Gerônimo",
    "Rua Irmãos Maristas",
    "Rua Isidoro Guilherme Dall'Agnol",
    "Rua Italo Gusti",
    "Rua Ivo Breitenbach",
    "Rua J",
    "Rua Jacy Costa Bernardes",
    "Rua Jocimar Antônio Ghidini",
    "Rua José Abruzzi",
    "Rua José Cagliari",
    "Rua José de Alencar",
    "Rua José do Patrocínio",
    "Rua José Francisco dos Santos",
    "Rua José Frison",
    "Rua José Siviero",
    "Rua José Veríssimo de Oliveira",
    "Rua João L de Carvalho",
    "Rua João Missaglia",
    "Rua João Paulo",
    "Rua Juraci Alves da Silva",
    "Rua L",
    "Rua Leonardo Busatto",
    "Rua Lodovico Silvio Omizzolo",
    "Rua Luiz Picolli",
    "Rua Luiz Siviero",
    "Rua Maestro Geremias Roncatto",
    "Rua Mansueto Bernardi",
    "Rua Mansueto Dal Pai",
    "Rua Maranhão",
    "Rua Marciano Tedesco",
    "Rua Marechal Castelo Branco",
    "Rua Marechal Costa e Silva",
    "Rua Marechal Deodoro da Fonseca",
    "Rua Marechal Floriano Peixoto",
    "Rua Marechal Hermes da Fonseca",
    "Rua Mateus Costella",
    "Rua Mato Grosso",
    "Rua Moacir Durli",
    "Rua Noedi Cacir Guzzo",
    "Rua Octaviano Dalla Coleta",
    "Rua Olimpio Giugno",
    "Rua Olívio Ghiggi",
    "Rua Orestes a Marangoni",
    "Rua Orlando Galeazzi",
    "Rua Padre José",
    "Rua Papa João Paulo II",
    "Rua Paraná",
    "Rua Pará",
    "Rua Pernambuco",
    "Rua Pessato",
    "Rua Piauí",
    "Rua Porto Viro",
    "Rua Princesa Isabel",
    "Rua Professor Dyonísio Trevisan",
    "Rua Professora Edi Dall'Agnol Zago",
    "Rua Professora Ida Sonda Pessin",
    "Rua Professora Leda Maria Migon Cagliari",
    "Rua Professora Luciana Scalco",
    "Rua Professora Maristela Parise Farenzena",
    "Rua Professora Reni Caron",
    "Rua Prudente de Moraes",
    "Rua Raul Ghelere",
    "Rua Reinoldo Silvestre",
    "Rua Reschke",
    "Rua Rodrigues Alves",
    "Rua Rogério Galeazzi",
    "Rua Roma",
    "Rua Romolo Putti",
    "Rua Rui Barbosa",
    "Rua Santa Catarina",
    "Rua Santo Bonifácio Fabbi",
    "Rua Santo Scarton",
    "Rua Saul da Silva Santos",
    "Rua Saul Irineu Farina",
    "Rua Sergina Tosan Faccin",
    "Rua Severino José Ranzan",
    "Rua Sigmundo Reschke",
    "Rua São Francisco de Assis",
    "Rua São Marcos",
    "Rua Sérgio Bassani",
    "Rua Teodoro Dal Pian",
    "Rua Tiradentes",
    "Rua Túlio Veronese",
    "Rua Urbano Alves de Moraes",
    "Rua Valdomiro Bernardi",
    "Rua Valdomiro Giugno",
    "Rua Venceslau Brás",
    "Rua Vereador Ademir Simonetto",
    "Rua Vereador Geraldo Karmirsck",
    "Rua Vereador Hugolino Giusti",
    "Rua Vereador Raymundo Iduino Zanettini",
    "Rua Vereador Valdir Rigon",
    "Rua Vergínio Festa",
    "Rua Vicente Celestino",
    "Rua Vicente de Freitas Lopes",
    "Rua Victório Dal Pai",
    "Rua Vitório José Zanini",
    "Rua Washington Luis",
    "Rua Zelindo Frizon",
    "Rua Zenaide Maria Boff",
    "Rua Ângelo Zanettini",
    "Sapopema",
    "Travessa A",
    "Travessa Bissani",
    "Travessa Buratto",
    "Travessa Denti",
    "Travessa Epitácio Pessoa",
    "Travessa Roncato",
    "Travessa Taborda",
    "Travessa Tiradentes",
    "Trilha Gruta Indígena",
]


def upgrade() -> None:
    op.create_table(
        "logradouro_referencia",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("nome", sa.String(length=255), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("nome"),
    )

    bind = op.get_bind()
    existentes = {
        row[0]
        for row in bind.execute(
            sa.text("SELECT nome FROM logradouro_referencia")
        ).fetchall()
    }

    novos = [
        {"id": uuid.uuid4(), "nome": nome}
        for nome in NOMES
        if nome not in existentes
    ]
    if novos:
        bind.execute(logradouro_referencia_table.insert(), novos)


def downgrade() -> None:
    op.drop_table("logradouro_referencia")
