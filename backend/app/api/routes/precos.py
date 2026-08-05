# [mcp-local harness] feature: clientes-precos-vales-e-module-label | plano: 7a1919ed | 2026-08-04 23:26:17
# Endpoints de Preco: lista produtos+preco vigente, e cadastra novo preco (fechando o anterior)
# [mcp-local harness] feature: clientes-precos-vales-e-module-label | plano: 7a1919ed
"""
Rotas de Preço -- "uma tela parecida com Produto que atribui preço em
cada produto" (RF-02 do apanhado do Giovani). Controle de acesso pelo
MESMO módulo RBAC "produtos" (não criamos um módulo "precos" à parte
-- preço é um atributo de produto, e o Gerente já tem create/update
em produtos, então não precisa reconfigurar nada na Matriz de
Permissões pra isso funcionar).

Preço tem vigência (ver Preco em models.py): cadastrar um preço novo
fecha o vigente anterior e abre um novo -- nunca sobrescreve.
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
    """Lista todos os produtos com o preço vigente de cada um (nulo
    se o produto ainda não tem preço cadastrado)."""
    produtos = session.exec(select(Item).order_by(Item.title)).all()

    data = []
    for produto in produtos:
        preco = _preco_vigente(session, produto.id)
        data.append(
            ProdutoComPrecoPublic(
                id=produto.id,
                title=produto.title,
                description=produto.description,
                preco_atual=preco.valor if preco else None,
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
    """Cadastra um novo preço vigente pro produto, fechando o
    anterior (se houver)."""
    produto = session.get(Item, produto_id)
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    agora = get_datetime_utc()
    atual = _preco_vigente(session, produto_id)
    if atual:
        atual.valid_to = agora
        session.add(atual)

    novo = Preco(produto_id=produto_id, valor=preco_in.valor, valid_from=agora)
    session.add(novo)
    session.commit()
    session.refresh(novo)
    return novo
