# [mcp-local harness] feature: clientes-precos-vales-e-module-label | plano: 7a1919ed | 2026-08-04 23:26:47
# Endpoints de BlocoVale: cria bloco+vales com motorista atribuido na mesma chamada, valida colisao de numeracao global
# [mcp-local harness] feature: clientes-precos-vales-e-module-label | plano: 7a1919ed
"""
Rotas de Bloco de Vale. Controle de acesso via módulo RBAC "vales".

Criação é uma chamada só: motorista + intervalo de folhas juntos (RF-03
+ decisão confirmada com o Ricardo -- motorista_id é fixo desde a
criação, não existe endpoint pra reatribuir bloco depois). Isso já
implementa o "cadastro do bloco seguido da atribuição ao motorista na
mesma página" pedido -- é o mesmo formulário, não duas telas.

A criação gera uma linha Vale pra cada número do intervalo
[primeira_folha, ultima_folha], validando que nenhum desses números já
existe em QUALQUER outro bloco (numeração é única em todo o sistema,
não só dentro do bloco -- decisão confirmada).
"""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, func, select

from app.api.deps import SessionDep, require_module_permission
from app.models import BlocoVale, BlocoValeCreate, BlocoValePublic, BlocosValePublic, User, Vale

router = APIRouter(prefix="/blocos-vale", tags=["vales"])

MODULE = "vales"

MAX_FOLHAS_POR_BLOCO = 1000


def _motorista_nome(motorista: User | None) -> str:
    if not motorista:
        return "(usuário removido)"
    return motorista.full_name or motorista.email


def _to_bloco_public(session: SessionDep, bloco: BlocoVale) -> BlocoValePublic:
    motorista = session.get(User, bloco.motorista_id)
    total = session.exec(
        select(func.count()).select_from(Vale).where(Vale.bloco_id == bloco.id)
    ).one()
    return BlocoValePublic(
        id=bloco.id,
        motorista_id=bloco.motorista_id,
        motorista_nome=_motorista_nome(motorista),
        primeira_folha=bloco.primeira_folha,
        ultima_folha=bloco.ultima_folha,
        total_vales=total,
        created_at=bloco.created_at,
    )


@router.get(
    "/",
    response_model=BlocosValePublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_blocos_vale(session: SessionDep) -> Any:
    blocos = session.exec(
        select(BlocoVale).order_by(col(BlocoVale.created_at).desc())
    ).all()
    return BlocosValePublic(data=[_to_bloco_public(session, b) for b in blocos])


@router.post(
    "/",
    response_model=BlocoValePublic,
    dependencies=[Depends(require_module_permission(MODULE, action="create"))],
)
def create_bloco_vale(*, session: SessionDep, bloco_in: BlocoValeCreate) -> Any:
    """Cria o bloco de vale já atribuído a um motorista, e gera os
    vales (um por número da sequência)."""
    motorista = session.get(User, bloco_in.motorista_id)
    if not motorista:
        raise HTTPException(status_code=404, detail="Motorista não encontrado")

    if bloco_in.ultima_folha < bloco_in.primeira_folha:
        raise HTTPException(
            status_code=400,
            detail="A última folha deve ser maior ou igual à primeira folha",
        )

    numeros = list(range(bloco_in.primeira_folha, bloco_in.ultima_folha + 1))
    if len(numeros) > MAX_FOLHAS_POR_BLOCO:
        raise HTTPException(
            status_code=400,
            detail=f"Intervalo grande demais (máximo {MAX_FOLHAS_POR_BLOCO} folhas por bloco)",
        )

    conflitos = session.exec(
        select(Vale.numero).where(col(Vale.numero).in_(numeros))
    ).all()
    if conflitos:
        amostra = ", ".join(str(n) for n in sorted(conflitos)[:10])
        sufixo = "..." if len(conflitos) > 10 else ""
        raise HTTPException(
            status_code=400,
            detail=(
                f"Os números {amostra}{sufixo} já pertencem a outro bloco de "
                "vale -- a numeração é única em todo o sistema"
            ),
        )

    bloco = BlocoVale(
        motorista_id=bloco_in.motorista_id,
        primeira_folha=bloco_in.primeira_folha,
        ultima_folha=bloco_in.ultima_folha,
    )
    session.add(bloco)
    session.flush()

    for numero in numeros:
        session.add(Vale(numero=numero, bloco_id=bloco.id))

    session.commit()
    session.refresh(bloco)
    return _to_bloco_public(session, bloco)
