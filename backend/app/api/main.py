# [mcp-local harness] feature: delegacao-venda-fase2-geocoding | plano: 938523a3 | 2026-08-06 20:17:03
# Registra geografia.enderecos_router
from fastapi import APIRouter

from app.api.routes import (
    clientes,
    delegacao,
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


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
