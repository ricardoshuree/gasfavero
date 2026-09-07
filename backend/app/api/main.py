# [mcp-local harness] feature: emprestimo_casco | plano: 1c0b80ad | 2026-09-07 15:10:46
# Registra cascos.router no api_router
from fastapi import APIRouter

from app.api.routes import (
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


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
