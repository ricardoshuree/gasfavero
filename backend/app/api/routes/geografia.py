# [mcp-local harness] feature: logradouros-referencia-autocomplete | plano: 086978c1 | 2026-08-06 15:45:01
# Adiciona GET /bairros/logradouros-referencia, posicionado ANTES de /{bairro_id}/ruas por clareza (nao ha colisao de rota real, mas evita confusao)
"""
Rotas de leitura da geografia (Cidade > Bairro > Rua) -- dado de
referência puro, sem informação sensível, então só exige usuário
autenticado (sem gate de módulo específico). Usado pelos formulários
de cadastro de endereço (Cliente) pra popular os selects de bairro e
sugerir ruas já conhecidas daquele bairro.

Não há endpoint de escrita aqui de propósito: Cidade/Bairro são
cadastro fixo (seed via migration); Rua "cresce por uso" -- é criada
automaticamente pelo endpoint de Cliente (ver clientes.py) na hora
que alguém cadastra o primeiro endereço numa rua nova, não por um
CRUD dedicado.
"""
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Bairro,
    BairroPublic,
    BairrosPublic,
    LogradouroReferencia,
    LogradouroReferenciaPublic,
    LogradourosReferenciaPublic,
    Rua,
    RuaPublic,
    RuasPublic,
)

router = APIRouter(prefix="/bairros", tags=["geografia"])


@router.get("/", response_model=BairrosPublic)
def read_bairros(session: SessionDep, current_user: CurrentUser) -> Any:
    """Lista os bairros cadastrados (hoje só Veranópolis tem bairros)."""
    bairros = session.exec(select(Bairro).order_by(Bairro.nome)).all()
    return BairrosPublic(data=[BairroPublic.model_validate(b) for b in bairros])


@router.get("/logradouros-referencia", response_model=LogradourosReferenciaPublic)
def read_logradouros_referencia(session: SessionDep, current_user: CurrentUser) -> Any:
    """Catálogo de nomes de rua conhecidos da cidade (~239, ver
    migration g2h3i4j5k6l7) -- SEM bairro associado (ver comentário em
    LogradouroReferencia, models.py). Retorna a lista inteira, sem
    paginação/busca no servidor (volume pequeno) -- o frontend mescla
    isso com as ruas já cadastradas no bairro selecionado
    (GET /bairros/{bairro_id}/ruas) pra alimentar o RuaAutocomplete
    com sugestões, independente de bairro."""
    logradouros = session.exec(
        select(LogradouroReferencia).order_by(LogradouroReferencia.nome)
    ).all()
    return LogradourosReferenciaPublic(
        data=[LogradouroReferenciaPublic.model_validate(r) for r in logradouros]
    )


@router.get("/{bairro_id}/ruas", response_model=RuasPublic)
def read_ruas(session: SessionDep, current_user: CurrentUser, bairro_id: uuid.UUID) -> Any:
    """Lista as ruas já cadastradas nesse bairro -- usado como
    sugestão no cadastro de endereço; não é uma lista fechada (a rua
    digitada pelo usuário não precisa estar nessa lista, ver
    EnderecoCreate em clientes.py)."""
    bairro = session.get(Bairro, bairro_id)
    if not bairro:
        raise HTTPException(status_code=404, detail="Bairro não encontrado")
    ruas = session.exec(
        select(Rua).where(Rua.bairro_id == bairro_id).order_by(Rua.nome)
    ).all()
    return RuasPublic(data=[RuaPublic.model_validate(r) for r in ruas])
