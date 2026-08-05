# [mcp-local harness] feature: clientes-precos-vales-e-module-label | plano: 7a1919ed | 2026-08-04 23:26:54
# Registra geografia, clientes, precos e vales no api_router
# [mcp-local harness] feature: clientes-precos-vales-e-module-label | plano: 7a1919ed
# Registra os routers de geografia, clientes, precos e vales
from fastapi import APIRouter

from app.api.routes import (
    clientes,
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
api_router.include_router(clientes.router)
api_router.include_router(precos.router)
api_router.include_router(vales.router)


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
