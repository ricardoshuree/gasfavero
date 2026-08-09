# [mcp-local harness] feature: limpeza-dados-teste | plano: 348d388c | 2026-08-09 14:02:57
# Script de limpeza de dados transacionais de teste, dry-run por padrao
"""Limpeza de dados TRANSACIONAIS de teste -- sessão 09/08.

MANTÉM intactos: Usuários (User + RBAC), Produtos (Item), Preços
(Preco), e Geografia (Cidade/Bairro/Rua/LogradouroReferencia -- é
catálogo de referência real de Veranópolis, não dado de teste, mesmo
que algumas ruas específicas tenham nascido de endereços de clientes
fake durante os testes; o NOME da rua em si tende a ser real e será
reaproveitado por clientes de verdade).

APAGA de vez (irreversível, sem soft-delete nem backup automático --
decisão do Ricardo: "todos os registros presentes (operacionais) são
registros de teste"):
  - Chamados (DemandaVenda + DemandaVendaItem)
  - Vendas (Venda + VendaItem)
  - Blocos de Vale (BlocoVale + Vale)
  - Clientes (Cliente + ClienteEndereco)
  - Endereços (Endereco)
  - Localização de motorista (MotoristaLocalizacao)

ORDEM DE DELEÇÃO importa -- respeita as FKs RESTRICT do schema (ver
models.py); deletar fora de ordem quebra com IntegrityError:
  1. DemandaVenda  (cascade -> DemandaVendaItem; RESTRICT em cliente_id/
     endereco_id/motorista_id -- por isso vem antes de Cliente/Endereco)
  2. Venda         (cascade -> VendaItem; RESTRICT em cliente_id/vale_id
     -- por isso vem antes de Cliente e de BlocoVale/Vale)
  3. BlocoVale     (cascade -> Vale; depois de Venda porque Venda.vale_id
     é RESTRICT)
  4. Cliente       (cascade -> ClienteEndereco; depois de DemandaVenda e
     Venda, que têm RESTRICT em cliente_id)
  5. Endereco      (depois de Cliente, porque ClienteEndereco.endereco_id
     é RESTRICT -- mas ClienteEndereco já foi cascade-apagado no passo 4)
  6. MotoristaLocalizacao (independente, sem FK de terceiros)

Uso (execução SEMPRE manual pelo Ricardo, nunca automatizada):

    cd backend
    uv run python -m app.limpar_dados_transacionais              # dry-run, só mostra contagens
    uv run python -m app.limpar_dados_transacionais --confirmar  # apaga de verdade
"""
import argparse
import logging

from sqlmodel import Session, func, select

from app.core.db import engine
from app.models import (
    BlocoVale,
    Cliente,
    DemandaVenda,
    Endereco,
    MotoristaLocalizacao,
    Venda,
)

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

# Ordem fixa -- ver docstring do módulo pra por que essa ordem
# específica é obrigatória (FKs RESTRICT).
TABELAS_EM_ORDEM = [
    ("Chamados (DemandaVenda)", DemandaVenda),
    ("Vendas (Venda)", Venda),
    ("Blocos de Vale (BlocoVale)", BlocoVale),
    ("Clientes (Cliente)", Cliente),
    ("Endereços (Endereco)", Endereco),
    ("Localização de motorista (MotoristaLocalizacao)", MotoristaLocalizacao),
]


def contar(session: Session) -> None:
    logger.info("Contagem atual:")
    for nome, model in TABELAS_EM_ORDEM:
        total = session.exec(select(func.count()).select_from(model)).one()
        logger.info("  %s: %s", nome, total)


def apagar(session: Session) -> None:
    for nome, model in TABELAS_EM_ORDEM:
        objetos = session.exec(select(model)).all()
        for obj in objetos:
            session.delete(obj)
        session.flush()
        logger.info("  Apagado: %s (%s registros)", nome, len(objetos))
    session.commit()


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Limpa dados TRANSACIONAIS de teste (chamados, vendas, vales, "
            "clientes, enderecos, localizacao de motorista). Mantem "
            "usuarios, produtos, precos e geografia intactos."
        )
    )
    parser.add_argument(
        "--confirmar",
        action="store_true",
        help=(
            "Sem essa flag, roda em modo dry-run (so mostra as contagens, "
            "nao apaga nada). Com --confirmar, apaga de verdade -- acao "
            "IRREVERSIVEL."
        ),
    )
    args = parser.parse_args()

    with Session(engine) as session:
        contar(session)

        if not args.confirmar:
            logger.info(
                "\nDry-run -- nada foi apagado. Rode com --confirmar pra apagar de verdade."
            )
            return

        logger.info("\nApagando...")
        apagar(session)
        logger.info("\nConcluído. Nova contagem:")
        contar(session)


if __name__ == "__main__":
    main()
