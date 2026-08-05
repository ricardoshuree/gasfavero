# [mcp-local harness] feature: fluxo-vendas-distribuidora | plano: 3f2bec12 | 2026-08-05 10:34:47
# Registra vendas.router
# [mcp-local harness] feature: clientes-precos-vales-e-module-label | plano: 7a1919ed
# Registra os routers de geografia, clientes, precos e vales
#
# [mcp-local harness] feature: fluxo-vendas-distribuidora | plano: 3f2bec12
# Registra o router de vendas
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
api_router.include_router(clientes.router)
api_router.include_router(precos.router)
api_router.include_router(vales.router)
api_router.include_router(vendas.router)


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
