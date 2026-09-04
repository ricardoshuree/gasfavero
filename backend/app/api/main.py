# [mcp-local harness] feature: abertura-dia | plano: 8346bf80 | 2026-09-04 15:11:40
# Registra fechamento.router no api_router
from fastapi import APIRouter

from app.api.routes import (
    clientes,
    delegacao,
    fechamento,
    geografia,
    items,
    login,
    modules,
    precos,
    private,
    roles,
    users,
    utils,
    vales,
    vendas,
)
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(roles.router)
api_router.include_router(modules.router)
api_router.include_router(utils.router)
api_router.include_router(items.router)
api_router.include_router(geografia.router)
api_router.include_router(geografia.enderecos_router)
api_router.include_router(clientes.router)
api_router.include_router(precos.router)
api_router.include_router(vales.router)
api_router.include_router(vendas.router)
api_router.include_router(delegacao.router)
api_router.include_router(fechamento.router)


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
