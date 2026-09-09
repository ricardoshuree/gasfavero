# [mcp-local harness] feature: venda_casco_produto | plano: 5805b812 | 2026-09-09 11:45:28
# Inclui vende_casco e preco_casco_atual no response; persiste preco_casco no novo Preco
"""
Rotas de Preço -- controle de acesso pelo módulo RBAC "produtos".
Preço tem vigência: cadastrar novo preço fecha o anterior e abre um novo -- nunca sobrescreve.
preco_casco: incluso na mesma linha de vigência (quando produto tem vende_casco=True).
"""
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, select

from app.api.deps import SessionDep, require_module_permission
from app.models import (
    Item,
    Preco,
    PrecoCreate,
    PrecoPublic,
    ProdutoComPrecoPublic,
    ProdutosComPrecoPublic,
    get_datetime_utc,
)

router = APIRouter(prefix="/precos", tags=["precos"])

MODULE = "produtos"


def _preco_vigente(session: SessionDep, produto_id: uuid.UUID) -> Preco | None:
    return session.exec(
        select(Preco)
        .where(Preco.produto_id == produto_id)
        .where(col(Preco.valid_to).is_(None))
    ).first()


@router.get(
    "/",
    response_model=ProdutosComPrecoPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_precos(session: SessionDep) -> Any:
    """Lista todos os produtos com o preço vigente de cada um."""
    produtos = session.exec(select(Item).order_by(Item.title)).all()

    data = []
    for produto in produtos:
        preco = _preco_vigente(session, produto.id)
        data.append(
            ProdutoComPrecoPublic(
                id=produto.id,
                title=produto.title,
                description=produto.description,
                vende_casco=produto.vende_casco,
                preco_atual=preco.valor if preco else None,
                preco_casco_atual=preco.preco_casco if preco else None,
                preco_valid_from=preco.valid_from if preco else None,
            )
        )

    return ProdutosComPrecoPublic(data=data)


@router.post(
    "/{produto_id}",
    response_model=PrecoPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="update"))],
)
def set_preco(
    *, session: SessionDep, produto_id: uuid.UUID, preco_in: PrecoCreate
) -> Any:
    """Cadastra um novo preço vigente pro produto, fechando o anterior (se houver)."""
    produto = session.get(Item, produto_id)
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    # Validação: se produto vende casco, preco_casco é obrigatório
    if produto.vende_casco and preco_in.preco_casco is None:
        raise HTTPException(
            status_code=400,
            detail="Este produto vende casco — informe o preço do casco"
        )

    agora = get_datetime_utc()
    atual = _preco_vigente(session, produto_id)
    if atual:
        atual.valid_to = agora
        session.add(atual)

    novo = Preco(
        produto_id=produto_id,
        valor=preco_in.valor,
        preco_casco=preco_in.preco_casco if produto.vende_casco else None,
        valid_from=agora,
    )
    session.add(novo)
    session.commit()
    session.refresh(novo)
    return novo
