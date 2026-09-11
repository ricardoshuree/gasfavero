# [mcp-local harness] feature: avisos-mapa | plano: 8e60d08b | 2026-09-11 19:54:27
# CRUD de AvisoMapa — GET lista, POST criar, PUT reorder bulk, PATCH editar, DELETE remover
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, select

from app.api.deps import SessionDep, require_module_permission
from app.models import (
    AvisoMapa,
    AvisoMapaCreate,
    AvisoMapaPublic,
    AvisoMapaUpdate,
    AvisosMapaPublic,
)

router = APIRouter(prefix="/avisos-mapa", tags=["avisos-mapa"])

# Reutiliza o módulo "mapa" para controle de permissão — quem pode
# ler o mapa pode ver os avisos; só quem pode criar/editar no módulo
# mapa pode configurar os slides.
MODULE = "mapa"


@router.get(
    "/",
    response_model=AvisosMapaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def list_avisos(session: SessionDep) -> Any:
    """Lista todos os avisos ordenados por `ordem` asc, `created_at` asc."""
    avisos = session.exec(
        select(AvisoMapa).order_by(col(AvisoMapa.ordem).asc(), col(AvisoMapa.created_at).asc())
    ).all()
    return AvisosMapaPublic(data=list(avisos), count=len(avisos))


@router.get(
    "/ativos",
    response_model=AvisosMapaPublic,
)
def list_avisos_ativos(session: SessionDep) -> Any:
    """Lista apenas avisos ativos — consumido pelo player no PainelLateral (sem autenticação de permissão específica, pois roda na TV)."""
    avisos = session.exec(
        select(AvisoMapa)
        .where(AvisoMapa.ativo == True)  # noqa: E712
        .order_by(col(AvisoMapa.ordem).asc(), col(AvisoMapa.created_at).asc())
    ).all()
    return AvisosMapaPublic(data=list(avisos), count=len(avisos))


@router.post(
    "/",
    response_model=AvisoMapaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="create"))],
)
def create_aviso(session: SessionDep, body: AvisoMapaCreate) -> Any:
    """Cria um novo aviso. A ordem é definida pelo cliente (drag-and-drop no frontend)."""
    aviso = AvisoMapa(**body.model_dump())
    session.add(aviso)
    session.commit()
    session.refresh(aviso)
    return aviso


@router.patch(
    "/{aviso_id}",
    response_model=AvisoMapaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="update"))],
)
def update_aviso(session: SessionDep, aviso_id: uuid.UUID, body: AvisoMapaUpdate) -> Any:
    """Atualiza campos de um aviso existente. Campos não enviados são ignorados."""
    aviso = session.get(AvisoMapa, aviso_id)
    if not aviso:
        raise HTTPException(status_code=404, detail="Aviso nao encontrado")
    data = body.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")
    for campo, valor in data.items():
        setattr(aviso, campo, valor)
    aviso.updated_at = datetime.now(UTC)
    session.add(aviso)
    session.commit()
    session.refresh(aviso)
    return aviso


@router.put(
    "/reordenar",
    response_model=AvisosMapaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="update"))],
)
def reordenar_avisos(session: SessionDep, ids: list[uuid.UUID]) -> Any:
    """Recebe lista de IDs na nova ordem e atualiza o campo `ordem` de cada aviso.
    O frontend envia os IDs na ordem visual do drag-and-drop."""
    for posicao, aviso_id in enumerate(ids):
        aviso = session.get(AvisoMapa, aviso_id)
        if not aviso:
            raise HTTPException(status_code=404, detail=f"Aviso {aviso_id} nao encontrado")
        aviso.ordem = posicao
        aviso.updated_at = datetime.now(UTC)
        session.add(aviso)
    session.commit()
    avisos = session.exec(
        select(AvisoMapa).order_by(col(AvisoMapa.ordem).asc())
    ).all()
    return AvisosMapaPublic(data=list(avisos), count=len(avisos))


@router.delete(
    "/{aviso_id}",
    dependencies=[Depends(require_module_permission(MODULE, action="delete"))],
)
def delete_aviso(session: SessionDep, aviso_id: uuid.UUID) -> Any:
    """Remove permanentemente um aviso."""
    aviso = session.get(AvisoMapa, aviso_id)
    if not aviso:
        raise HTTPException(status_code=404, detail="Aviso nao encontrado")
    session.delete(aviso)
    session.commit()
    return {"message": "Aviso removido"}
