# [mcp-local harness] feature: abertura-dia | plano: 8346bf80 | 2026-09-04 15:11:32
# Rotas de abertura do dia: status, criar abertura, editar com ajuste contábil, verificar senha do gerente
"""
Rotas de Fechamento Diario (abertura do dia por motorista).

Fluxo da abertura:
  1. Gerente seleciona motorista e informa fundo de troco
  2. Backend cria AberturaDia + conta de Caixa em Transito do motorista
     (se ainda nao existir) + lancamento contabil:
     D: Conta Mestre (1000) / C: Caixa em Transito do motorista (110x)
  3. Edicao posterior (com senha do gerente validada no frontend):
     gera lancamento de ajuste pela diferenca -- nunca estorna o original

Regras:
  - Uma abertura por motorista por dia (unique constraint no banco)
  - Somente usuarios com permissao can_create no modulo 'fechamento'
  - Fechamento do dia so funciona se a abertura foi feita
  - Botao de abertura fica desabilitado se ja foi aberto hoje
"""
import uuid
from datetime import date, datetime, UTC
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlmodel import select, func

import sqlalchemy as sa

from app.api.deps import CurrentUser, SessionDep, require_module_permission
from app.core.security import verify_password
from app.models import User

router = APIRouter(prefix="/fechamento", tags=["fechamento"])

MODULE = "fechamento"

# UUIDs fixos das contas do plano de contas (seed da migration n9o0p1q2r3s4)
CONTA_MESTRE_ID   = "10000000-0000-0000-0000-000000000001"
CONTA_TRANSITO_ID = "11000000-0000-0000-0000-000000000001"  # conta sintetica pai


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_or_create_conta_motorista(session: SessionDep, motorista_id: str) -> str:
    """Retorna o UUID da conta de Caixa em Transito do motorista.
    Se nao existir, cria sob a conta sintetica 1100, numerada
    sequencialmente (1101, 1102, ...)."""
    result = session.exec(
        sa.text("SELECT id FROM conta WHERE motorista_id = :mid"),
        {"mid": motorista_id}  # type: ignore
    ).first()

    # SQLModel nao tem execute direto com params -- usar connection
    conn = session.connection()

    row = conn.execute(
        sa.text("SELECT id FROM conta WHERE motorista_id = :mid"),
        {"mid": motorista_id}
    ).fetchone()

    if row:
        return str(row[0])

    # Descobre o proximo numero (1101, 1102, ...)
    max_num = conn.execute(
        sa.text(
            "SELECT MAX(CAST(numero AS INTEGER)) FROM conta "
            "WHERE pai_id = :pai AND numero ~ '^[0-9]+$' AND CAST(numero AS INTEGER) >= 1101"
        ),
        {"pai": CONTA_TRANSITO_ID}
    ).scalar()

    proximo_numero = str((max_num or 1100) + 1)

    # Busca nome do motorista
    motorista = conn.execute(
        sa.text("SELECT full_name, email FROM \"user\" WHERE id = :uid"),
        {"uid": motorista_id}
    ).fetchone()
    nome = motorista[0] or motorista[1] if motorista else "Motorista"

    nova_conta_id = str(uuid.uuid4())
    conn.execute(
        sa.text(
            "INSERT INTO conta (id, numero, nome, tipo, pai_id, motorista_id, ativo, created_at) "
            "VALUES (:id, :numero, :nome, 'analitica', :pai_id, :motorista_id, true, NOW())"
        ),
        {
            "id": nova_conta_id,
            "numero": proximo_numero,
            "nome": f"Caixa em Transito - {nome}",
            "pai_id": CONTA_TRANSITO_ID,
            "motorista_id": motorista_id,
        }
    )
    return nova_conta_id


def _criar_lancamento(
    session: SessionDep,
    data: date,
    descricao: str,
    valor: Decimal,
    debito_id: str,
    credito_id: str,
    abertura_id: str,
    criado_por_id: str,
) -> None:
    conn = session.connection()
    conn.execute(
        sa.text(
            "INSERT INTO lancamento_contabil "
            "(id, data, descricao, valor, debito_id, credito_id, abertura_id, criado_por_id, created_at) "
            "VALUES (:id, :data, :descricao, :valor, :debito_id, :credito_id, :abertura_id, :criado_por_id, NOW())"
        ),
        {
            "id": str(uuid.uuid4()),
            "data": data,
            "descricao": descricao,
            "valor": valor,
            "debito_id": debito_id,
            "credito_id": credito_id,
            "abertura_id": abertura_id,
            "criado_por_id": criado_por_id,
        }
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get(
    "/status/{data}",
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_status_abertura(session: SessionDep, data: date) -> Any:
    """Retorna o status de abertura de cada motorista para a data informada.
    Usado pela tela para habilitar/desabilitar os botoes de abertura e fechamento."""
    conn = session.connection()

    # Busca todos os motoristas (role motorista)
    motoristas = conn.execute(sa.text(
        "SELECT u.id, u.full_name, u.email "
        "FROM \"user\" u "
        "JOIN user_role ur ON ur.user_id = u.id "
        "JOIN role r ON r.id = ur.role_id "
        "WHERE LOWER(r.name) = 'motorista' AND u.is_active = true "
        "ORDER BY u.full_name"
    )).fetchall()

    resultado = []
    for m in motoristas:
        motorista_id = str(m[0])
        nome = m[1] or m[2]

        abertura = conn.execute(sa.text(
            "SELECT id, fundo_troco, created_at FROM abertura_dia "
            "WHERE motorista_id = :mid AND data = :data"
        ), {"mid": motorista_id, "data": data}).fetchone()

        resultado.append({
            "motorista_id": motorista_id,
            "motorista_nome": nome,
            "aberto": abertura is not None,
            "abertura_id": str(abertura[0]) if abertura else None,
            "fundo_troco": float(abertura[1]) if abertura else None,
            "aberto_em": abertura[2].isoformat() if abertura else None,
        })

    return {"data": data.isoformat(), "motoristas": resultado}


@router.post(
    "/abertura",
    dependencies=[Depends(require_module_permission(MODULE, action="create"))],
)
def criar_abertura(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    body: dict,
) -> Any:
    """Abre o dia para um motorista.
    Body: { motorista_id, fundo_troco, data? }
    Cria a conta de Caixa em Transito do motorista se nao existir.
    Gera lancamento: D Conta Mestre / C Caixa em Transito motorista.
    """
    motorista_id = body.get("motorista_id")
    fundo_troco = Decimal(str(body.get("fundo_troco", 0)))
    data_abertura = date.fromisoformat(body["data"]) if body.get("data") else date.today()

    if not motorista_id:
        raise HTTPException(status_code=400, detail="motorista_id e obrigatorio")
    if fundo_troco <= 0:
        raise HTTPException(status_code=400, detail="Fundo de troco deve ser maior que zero")

    conn = session.connection()

    # Verifica se ja existe abertura hoje para este motorista
    existente = conn.execute(sa.text(
        "SELECT id FROM abertura_dia WHERE motorista_id = :mid AND data = :data"
    ), {"mid": motorista_id, "data": data_abertura}).fetchone()

    if existente:
        raise HTTPException(
            status_code=400,
            detail="Ja existe uma abertura para este motorista nesta data"
        )

    # Garante conta de Caixa em Transito do motorista
    conta_motorista_id = _get_or_create_conta_motorista(session, motorista_id)

    # Cria AberturaDia
    abertura_id = str(uuid.uuid4())
    conn.execute(sa.text(
        "INSERT INTO abertura_dia (id, motorista_id, data, fundo_troco, aberto_por_id, created_at) "
        "VALUES (:id, :motorista_id, :data, :fundo_troco, :aberto_por_id, NOW())"
    ), {
        "id": abertura_id,
        "motorista_id": motorista_id,
        "data": data_abertura,
        "fundo_troco": fundo_troco,
        "aberto_por_id": str(current_user.id),
    })

    # Lancamento contabil: D Conta Mestre / C Caixa em Transito motorista
    _criar_lancamento(
        session,
        data=data_abertura,
        descricao=f"Abertura do dia - fundo de troco",
        valor=fundo_troco,
        debito_id=CONTA_MESTRE_ID,
        credito_id=conta_motorista_id,
        abertura_id=abertura_id,
        criado_por_id=str(current_user.id),
    )

    session.commit()
    return {"abertura_id": abertura_id, "conta_motorista_id": conta_motorista_id}


@router.patch(
    "/abertura/{abertura_id}",
    dependencies=[Depends(require_module_permission(MODULE, action="update"))],
)
def editar_abertura(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    abertura_id: str,
    body: dict,
) -> Any:
    """Edita o fundo de troco de uma abertura ja confirmada.
    Requer validacao de senha do gerente (feita no frontend antes de chamar).
    Gera lancamento de ajuste pela diferenca -- nunca estorna o original.
    Body: { novo_fundo_troco, senha_gerente }
    """
    novo_fundo = Decimal(str(body.get("novo_fundo_troco", 0)))
    if novo_fundo <= 0:
        raise HTTPException(status_code=400, detail="Fundo de troco deve ser maior que zero")

    conn = session.connection()

    abertura = conn.execute(sa.text(
        "SELECT id, motorista_id, data, fundo_troco FROM abertura_dia WHERE id = :id"
    ), {"id": abertura_id}).fetchone()

    if not abertura:
        raise HTTPException(status_code=404, detail="Abertura nao encontrada")

    fundo_atual = Decimal(str(abertura[3]))
    diferenca = novo_fundo - fundo_atual

    if diferenca == 0:
        raise HTTPException(status_code=400, detail="Novo valor igual ao atual")

    # Busca conta do motorista
    conta_motorista = conn.execute(sa.text(
        "SELECT id FROM conta WHERE motorista_id = :mid"
    ), {"mid": str(abertura[1])}).fetchone()

    if not conta_motorista:
        raise HTTPException(status_code=400, detail="Conta do motorista nao encontrada")

    # Atualiza abertura
    conn.execute(sa.text(
        "UPDATE abertura_dia SET fundo_troco = :novo, updated_at = NOW(), editado_por_id = :editor "
        "WHERE id = :id"
    ), {"novo": novo_fundo, "editor": str(current_user.id), "id": abertura_id})

    # Lancamento de ajuste pela diferenca
    if diferenca > 0:
        descricao = f"Ajuste de abertura - acrescimo de fundo de troco"
        debito_id = CONTA_MESTRE_ID
        credito_id = str(conta_motorista[0])
        valor_ajuste = diferenca
    else:
        descricao = f"Ajuste de abertura - reducao de fundo de troco"
        debito_id = str(conta_motorista[0])
        credito_id = CONTA_MESTRE_ID
        valor_ajuste = abs(diferenca)

    _criar_lancamento(
        session,
        data=abertura[2],
        descricao=descricao,
        valor=valor_ajuste,
        debito_id=debito_id,
        credito_id=credito_id,
        abertura_id=abertura_id,
        criado_por_id=str(current_user.id),
    )

    session.commit()
    return {"abertura_id": abertura_id, "fundo_troco": float(novo_fundo)}


@router.post("/verificar-senha-gerente")
def verificar_senha_gerente(
    *,
    session: SessionDep,
    body: dict,
) -> Any:
    """Valida email + senha do gerente antes de liberar edicao de abertura.
    Nao exige autenticacao propria -- a validacao e feita contra o banco.
    Body: { email, senha }
    """
    email = body.get("email", "").strip().lower()
    senha = body.get("senha", "")

    if not email or not senha:
        raise HTTPException(status_code=400, detail="Email e senha sao obrigatorios")

    conn = session.connection()
    gerente = conn.execute(sa.text(
        "SELECT u.id, u.hashed_password, u.is_active "
        "FROM \"user\" u "
        "JOIN user_role ur ON ur.user_id = u.id "
        "JOIN role r ON r.id = ur.role_id "
        "WHERE LOWER(u.email) = :email AND LOWER(r.name) IN ('gerente', 'admin') "
        "LIMIT 1"
    ), {"email": email}).fetchone()

    if not gerente:
        raise HTTPException(status_code=403, detail="Usuario nao encontrado ou sem permissao de gerente")

    if not gerente[2]:
        raise HTTPException(status_code=403, detail="Usuario inativo")

    if not verify_password(senha, gerente[1]):
        raise HTTPException(status_code=403, detail="Senha incorreta")

    return {"autorizado": True, "gerente_id": str(gerente[0])}
