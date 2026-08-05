# [mcp-local harness] feature: clientes-precos-vales-e-module-label | plano: 7a1919ed | 2026-08-04 23:25:07
# Endpoints de leitura de Bairro/Rua, sem gate de modulo (dado de referencia)
# [mcp-local harness] feature: clientes-precos-vales-e-module-label | plano: 7a1919ed
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
from app.models import Bairro, BairroPublic, BairrosPublic, Rua, RuaPublic, RuasPublic

router = APIRouter(prefix="/bairros", tags=["geografia"])


@router.get("/", response_model=BairrosPublic)
def read_bairros(session: SessionDep, current_user: CurrentUser) -> Any:
    """Lista os bairros cadastrados (hoje só Veranópolis tem bairros)."""
    bairros = session.exec(select(Bairro).order_by(Bairro.nome)).all()
    return BairrosPublic(data=[BairroPublic.model_validate(b) for b in bairros])


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
