# [mcp-local harness] feature: delegacao-venda-fase2-geocoding | plano: 0144c501 | 2026-08-06 20:16:41
# Adiciona endpoint POST /enderecos/{id}/geocodificar para retry manual de geocodificacao
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

Exceção: POST /enderecos/{id}/geocodificar -- não é leitura pura, é
um endpoint de RETRY manual de geocodificação (Fase 2 da Delegação de
Venda) pra endereços que ficaram sem latitude/longitude (cadastrados
antes desta feature existir, ou que falharam na tentativa automática
em clientes.py). Fica aqui e não em clientes.py porque opera sobre
Endereco diretamente, não sobre Cliente.
"""
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.core.geocoding import geocode
from app.models import (
    Bairro,
    BairroPublic,
    BairrosPublic,
    Cidade,
    Endereco,
    EnderecoPublic,
    LogradouroReferencia,
    LogradouroReferenciaPublic,
    LogradourosReferenciaPublic,
    Rua,
    RuaPublic,
    RuasPublic,
)

router = APIRouter(prefix="/bairros", tags=["geografia"])

enderecos_router = APIRouter(prefix="/enderecos", tags=["geografia"])


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


def _to_endereco_public(session: SessionDep, endereco: Endereco) -> EnderecoPublic:
    rua = session.get(Rua, endereco.rua_id)
    bairro = session.get(Bairro, rua.bairro_id) if rua else None
    cidade = session.get(Cidade, bairro.cidade_id) if bairro else None
    return EnderecoPublic(
        id=endereco.id,
        numero=endereco.numero,
        complemento=endereco.complemento,
        rua_nome=rua.nome if rua else "",
        bairro_nome=bairro.nome if bairro else "",
        cidade_nome=cidade.nome if cidade else "",
        latitude=endereco.latitude,
        longitude=endereco.longitude,
    )


@enderecos_router.post("/{endereco_id}/geocodificar", response_model=EnderecoPublic)
def geocodificar_endereco(
    session: SessionDep, current_user: CurrentUser, endereco_id: uuid.UUID
) -> Any:
    """Retry manual de geocodificação -- pra endereços cadastrados
    antes da Fase 2 existir, ou que falharam na tentativa automática
    (sem cota, API fora do ar, etc). SEMPRE tenta de novo quando
    chamado (diferente da criação, que só tenta uma vez) -- é uma ação
    explícita do usuário, não um retry silencioso em background."""
    endereco = session.get(Endereco, endereco_id)
    if not endereco:
        raise HTTPException(status_code=404, detail="Endereço não encontrado")

    rua = session.get(Rua, endereco.rua_id)
    if not rua:
        raise HTTPException(
            status_code=400, detail="Rua do endereço não encontrada (dado inconsistente)"
        )
    bairro = session.get(Bairro, rua.bairro_id)
    if not bairro:
        raise HTTPException(
            status_code=400, detail="Bairro do endereço não encontrado (dado inconsistente)"
        )

    coordenadas = geocode(rua_nome=rua.nome, numero=endereco.numero, bairro_nome=bairro.nome)
    if coordenadas is None:
        raise HTTPException(
            status_code=422,
            detail="Não foi possível geocodificar este endereço (não encontrado, API indisponível, ou cota diária esgotada)",
        )

    endereco.latitude, endereco.longitude = coordenadas
    session.add(endereco)
    session.commit()
    session.refresh(endereco)
    return _to_endereco_public(session, endereco)
