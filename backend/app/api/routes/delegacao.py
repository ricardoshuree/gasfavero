# [mcp-local harness] feature: delegacao-venda-fase1 | plano: 3390fd3a | 2026-08-06 19:00:16
# Adiciona CurrentUser como dependency de create_demanda_venda e grava criado_por_id=current_user.id (era None antes, violando NOT NULL)
"""
Rotas de Delegação de Venda (Fase 1). Controle de acesso via módulo
RBAC "delegacao" (já existente desde a migration b7c8d9e0f1a2).

Fase 1 = só a espinha dorsal de dados, testável via API: criar
demanda, listar por motorista/status, aceitar, recusar, e o upsert de
localização do motorista. SEM push, SEM mapa, SEM app -- essas peças
vêm nas Fases 2/3/4 (ver handoff do Ricardo).

endereco_id em DemandaVendaCreate é sempre um Endereco JÁ EXISTENTE
(nunca texto livre) -- decisão confirmada, porque sem endereço
estruturado não dá pra geocodificar/plotar no mapa nas fases
seguintes. Normalmente é o endereço vigente do próprio cliente (ver
clientes.py / ClienteEndereco), mas o endpoint aceita qualquer
endereco_id válido para não travar o caso de entrega num endereço
diferente do cadastrado.
"""
import uuid
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, select

from app.api.deps import CurrentUser, SessionDep, require_module_permission
from app.models import (
    Bairro,
    Cidade,
    Cliente,
    DemandaVenda,
    DemandaVendaCreate,
    DemandaVendaPublic,
    DemandasVendaPublic,
    Endereco,
    EnderecoPublic,
    MotoristaLocalizacao,
    MotoristaLocalizacaoPublic,
    MotoristaLocalizacaoUpdate,
    MotoristasLocalizacaoPublic,
    Rua,
    User,
    get_datetime_utc,
)

router = APIRouter(tags=["delegacao"])

MODULE = "delegacao"

STATUS_VALIDOS = ("pendente", "aceita", "recusada")


# ---------------------------------------------------------------------------
# Helpers internos
# ---------------------------------------------------------------------------

def _motorista_nome(motorista: User | None) -> str:
    if not motorista:
        return "(usuário removido)"
    return motorista.full_name or motorista.email


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
    )


def _to_demanda_public(session: SessionDep, demanda: DemandaVenda) -> DemandaVendaPublic:
    cliente = session.get(Cliente, demanda.cliente_id)
    endereco = session.get(Endereco, demanda.endereco_id)
    motorista = session.get(User, demanda.motorista_id)
    return DemandaVendaPublic(
        id=demanda.id,
        cliente_id=demanda.cliente_id,
        cliente_nome=cliente.nome if cliente else "(cliente removido)",
        endereco=_to_endereco_public(session, endereco),
        motorista_id=demanda.motorista_id,
        motorista_nome=_motorista_nome(motorista),
        observacao=demanda.observacao,
        status=demanda.status,
        criado_por_id=demanda.criado_por_id,
        created_at=demanda.created_at,
        respondida_em=demanda.respondida_em,
    )


def _to_localizacao_public(
    session: SessionDep, loc: MotoristaLocalizacao
) -> MotoristaLocalizacaoPublic:
    motorista = session.get(User, loc.motorista_id)
    return MotoristaLocalizacaoPublic(
        motorista_id=loc.motorista_id,
        motorista_nome=_motorista_nome(motorista),
        latitude=loc.latitude,
        longitude=loc.longitude,
        atualizado_em=loc.atualizado_em,
    )


# ---------------------------------------------------------------------------
# Rotas — Demanda de Venda
# ---------------------------------------------------------------------------

@router.get(
    "/demandas-venda/",
    response_model=DemandasVendaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_demandas_venda(
    session: SessionDep,
    motorista_id: uuid.UUID | None = None,
    status: Literal["pendente", "aceita", "recusada"] | None = None,
) -> Any:
    """Lista demandas de venda, mais recentes primeiro. Filtros
    opcionais por motorista (fila "Minhas Demandas" do motorista) e/ou
    status."""
    statement = select(DemandaVenda)
    if motorista_id is not None:
        statement = statement.where(DemandaVenda.motorista_id == motorista_id)
    if status is not None:
        statement = statement.where(DemandaVenda.status == status)

    demandas = session.exec(
        statement.order_by(col(DemandaVenda.created_at).desc())
    ).all()
    return DemandasVendaPublic(
        data=[_to_demanda_public(session, d) for d in demandas]
    )


@router.post(
    "/demandas-venda/",
    response_model=DemandaVendaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="create"))],
)
def create_demanda_venda(
    *, session: SessionDep, current_user: CurrentUser, demanda_in: DemandaVendaCreate
) -> Any:
    """Despacha uma demanda de venda pro motorista escolhido pelo
    atendente. Sempre nasce com status 'pendente'. criado_por_id é
    sempre o usuário autenticado que fez a chamada (o atendente),
    NUNCA o motorista pra quem a demanda foi despachada."""
    cliente = session.get(Cliente, demanda_in.cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    endereco = session.get(Endereco, demanda_in.endereco_id)
    if not endereco:
        raise HTTPException(status_code=404, detail="Endereço não encontrado")

    motorista = session.get(User, demanda_in.motorista_id)
    if not motorista:
        raise HTTPException(status_code=404, detail="Motorista não encontrado")

    demanda = DemandaVenda(
        cliente_id=demanda_in.cliente_id,
        endereco_id=demanda_in.endereco_id,
        motorista_id=demanda_in.motorista_id,
        observacao=demanda_in.observacao,
        criado_por_id=current_user.id,
    )
    session.add(demanda)
    session.commit()
    session.refresh(demanda)
    return _to_demanda_public(session, demanda)


def _responder_demanda(
    session: SessionDep, demanda_id: uuid.UUID, novo_status: str
) -> DemandaVenda:
    demanda = session.get(DemandaVenda, demanda_id)
    if not demanda:
        raise HTTPException(status_code=404, detail="Demanda não encontrada")
    if demanda.status != "pendente":
        raise HTTPException(
            status_code=400,
            detail=f"Esta demanda já foi respondida (status atual: '{demanda.status}')",
        )

    demanda.status = novo_status
    demanda.respondida_em = get_datetime_utc()
    session.add(demanda)
    session.commit()
    session.refresh(demanda)
    return demanda


@router.patch(
    "/demandas-venda/{demanda_id}/aceitar",
    response_model=DemandaVendaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="update"))],
)
def aceitar_demanda_venda(*, session: SessionDep, demanda_id: uuid.UUID) -> Any:
    """Motorista aceita a demanda -- só é permitido a partir de
    'pendente' (não dá pra aceitar uma demanda já recusada)."""
    demanda = _responder_demanda(session, demanda_id, "aceita")
    return _to_demanda_public(session, demanda)


@router.patch(
    "/demandas-venda/{demanda_id}/recusar",
    response_model=DemandaVendaPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="update"))],
)
def recusar_demanda_venda(*, session: SessionDep, demanda_id: uuid.UUID) -> Any:
    """Motorista recusa a demanda -- só é permitido a partir de
    'pendente'. Não existe endpoint de reatribuição automática aqui
    (Fase 1): o atendente vê a recusa na lista e despacha uma demanda
    NOVA pra outro motorista, se for o caso."""
    demanda = _responder_demanda(session, demanda_id, "recusada")
    return _to_demanda_public(session, demanda)


# ---------------------------------------------------------------------------
# Rotas — Localização de Motorista
# ---------------------------------------------------------------------------

@router.put(
    "/motoristas/{motorista_id}/localizacao",
    response_model=MotoristaLocalizacaoPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="update"))],
)
def upsert_localizacao_motorista(
    *,
    session: SessionDep,
    motorista_id: uuid.UUID,
    localizacao_in: MotoristaLocalizacaoUpdate,
) -> Any:
    """Ping de localização -- upsert puro (1 linha por motorista,
    sobrescrita sempre). Sem histórico de propósito (ver comentário em
    MotoristaLocalizacao, models.py). Gate de permissão é o módulo
    'delegacao' por enquanto -- quando o app do motorista existir
    (Fase 4) isso pode restringir pra 'o próprio motorista só atualiza
    a própria localização', mas essa regra ainda não foi desenhada."""
    motorista = session.get(User, motorista_id)
    if not motorista:
        raise HTTPException(status_code=404, detail="Motorista não encontrado")

    loc = session.get(MotoristaLocalizacao, motorista_id)
    if loc:
        loc.latitude = localizacao_in.latitude
        loc.longitude = localizacao_in.longitude
        loc.atualizado_em = get_datetime_utc()
    else:
        loc = MotoristaLocalizacao(
            motorista_id=motorista_id,
            latitude=localizacao_in.latitude,
            longitude=localizacao_in.longitude,
        )
    session.add(loc)
    session.commit()
    session.refresh(loc)
    return _to_localizacao_public(session, loc)


@router.get(
    "/motoristas/localizacao",
    response_model=MotoristasLocalizacaoPublic,
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_localizacoes_motoristas(session: SessionDep) -> Any:
    """Última posição conhecida de cada motorista que já deu ao menos
    1 ping -- base pros marcadores do mapa do atendente (Fase 3)."""
    locs = session.exec(select(MotoristaLocalizacao)).all()
    return MotoristasLocalizacaoPublic(
        data=[_to_localizacao_public(session, loc) for loc in locs]
    )
