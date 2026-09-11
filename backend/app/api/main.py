# [mcp-local harness] feature: avisos-mapa | plano: 0a252cd1 | 2026-09-11 19:57:05
# Adiciona avisos_mapa ao api_router
from fastapi import APIRouter

from app.api.routes import (
    avisos_mapa,
    cascos,
    clientes,
    vale_gas,
    gas_povo,
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
api_router.include_router(cascos.router)
api_router.include_router(delegacao.router)
api_router.include_router(fechamento.router)
api_router.include_router(vale_gas.router)
api_router.include_router(gas_povo.router)
api_router.include_router(avisos_mapa.router)


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
