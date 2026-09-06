# [mcp-local harness] feature: abertura-editar-produtos | plano: 4fe429bb | 2026-09-05 23:17:59
# Adiciona GET /abertura/{id}/produtos e atualiza PATCH para aceitar edicao de fundo e produtos com log por campo alterado
"""
Rotas de Fechamento Diario (abertura, fechamento e dashboard de saldos).
"""
import uuid
import json
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
import sqlalchemy as sa

from app.api.deps import CurrentUser, SessionDep, require_module_permission

router = APIRouter(prefix="/fechamento", tags=["fechamento"])

MODULE = "fechamento"

CONTA_MESTRE_ID     = "10000000-0000-0000-0000-000000000001"
CONTA_TRANSITO_ID   = "11000000-0000-0000-0000-000000000001"
CONTA_FIADO_ID      = "12000000-0000-0000-0000-000000000001"
CONTA_MAQUININHA_ID = "13000000-0000-0000-0000-000000000001"
CONTA_QUEBRA_ID     = "31000000-0000-0000-0000-000000000001"
CONTA_SOBRA_ID      = "32000000-0000-0000-0000-000000000001"

PREFIXO_AJUSTE_ABERTURA = "Ajuste de abertura"

SQL_MOTORISTAS = (
    'SELECT u.id, u.full_name, u.email '
    'FROM "user" u '
    'JOIN user_role ur ON ur.user_id = u.id '
    'JOIN role r ON r.id = ur.role_id '
    "WHERE LOWER(r.name) = 'motorista' AND u.is_active = true "
    'ORDER BY u.full_name'
)

SQL_USER_BY_ID = 'SELECT full_name, email FROM "user" WHERE id = :uid'


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_or_create_conta_motorista(session: SessionDep, motorista_id: str) -> str:
    conn = session.connection()
    row = conn.execute(
        sa.text("SELECT id FROM conta WHERE motorista_id = :mid"),
        {"mid": motorista_id}
    ).fetchone()
    if row:
        return str(row[0])

    max_num = conn.execute(
        sa.text(
            "SELECT MAX(CAST(numero AS INTEGER)) FROM conta "
            "WHERE pai_id = :pai AND numero ~ '^[0-9]+$' AND CAST(numero AS INTEGER) >= 1101"
        ),
        {"pai": CONTA_TRANSITO_ID}
    ).scalar()
    proximo_numero = str((max_num or 1100) + 1)

    motorista = conn.execute(sa.text(SQL_USER_BY_ID), {"uid": motorista_id}).fetchone()
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


def _criar_lancamento(session, data, descricao, valor, debito_id, credito_id, abertura_id, criado_por_id):
    conn = session.connection()
    conn.execute(
        sa.text(
            "INSERT INTO lancamento_contabil "
            "(id, data, descricao, valor, debito_id, credito_id, abertura_id, criado_por_id, created_at) "
            "VALUES (:id, :data, :descricao, :valor, :debito_id, :credito_id, :abertura_id, :criado_por_id, NOW())"
        ),
        {"id": str(uuid.uuid4()), "data": data, "descricao": descricao, "valor": valor,
         "debito_id": debito_id, "credito_id": credito_id, "abertura_id": abertura_id,
         "criado_por_id": criado_por_id}
    )


def _gravar_log_edicao(conn, abertura_id, campo, valor_anterior, valor_novo, editado_por_id):
    conn.execute(
        sa.text(
            "INSERT INTO abertura_dia_log "
            "(id, abertura_id, campo, valor_anterior, valor_novo, editado_por_id, editado_em) "
            "VALUES (:id, :abertura_id, :campo, :valor_anterior, :valor_novo, :editado_por_id, NOW())"
        ),
        {"id": str(uuid.uuid4()), "abertura_id": abertura_id, "campo": campo,
         "valor_anterior": valor_anterior, "valor_novo": valor_novo, "editado_por_id": editado_por_id}
    )


def _saldo_conta(conn, conta_id, inicio, fim):
    row = conn.execute(sa.text(
        "SELECT "
        "  COALESCE(SUM(CASE WHEN credito_id = :cid THEN valor ELSE 0 END), 0) - "
        "  COALESCE(SUM(CASE WHEN debito_id = :cid THEN valor ELSE 0 END), 0) "
        "FROM lancamento_contabil WHERE data >= :inicio AND data <= :fim "
        "AND (credito_id = :cid OR debito_id = :cid)"
    ), {"cid": conta_id, "inicio": inicio, "fim": fim}).scalar()
    return float(row or 0)


# ---------------------------------------------------------------------------
# Status / Abertura
# ---------------------------------------------------------------------------

@router.get(
    "/status/{data}",
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_status_abertura(session: SessionDep, data: date) -> Any:
    conn = session.connection()
    motoristas = conn.execute(sa.text(SQL_MOTORISTAS)).fetchall()

    resultado = []
    for m in motoristas:
        motorista_id = str(m[0])
        nome = m[1] or m[2]

        abertura = conn.execute(sa.text(
            "SELECT id, fundo_troco, created_at FROM abertura_dia "
            "WHERE motorista_id = :mid AND data = :data"
        ), {"mid": motorista_id, "data": data}).fetchone()

        fechamento = conn.execute(sa.text(
            "SELECT id FROM fechamento_dia WHERE motorista_id = :mid AND data = :data"
        ), {"mid": motorista_id, "data": data}).fetchone() if abertura else None

        logs = []
        if abertura:
            log_rows = conn.execute(sa.text(
                'SELECT adl.campo, adl.valor_anterior, adl.valor_novo, '
                'adl.editado_em, u.full_name, u.email '
                'FROM abertura_dia_log adl '
                'LEFT JOIN "user" u ON u.id = adl.editado_por_id '
                'WHERE adl.abertura_id = :abertura_id '
                'ORDER BY adl.editado_em DESC'
            ), {"abertura_id": str(abertura[0])}).fetchall()
            for lr in log_rows:
                logs.append({
                    "campo": lr[0],
                    "valor_anterior": lr[1],
                    "valor_novo": lr[2],
                    "editado_em": lr[3].isoformat(),
                    "editado_por": lr[4] or lr[5] or "?",
                })

        resultado.append({
            "motorista_id": motorista_id,
            "motorista_nome": nome,
            "aberto": abertura is not None,
            "fechado": fechamento is not None,
            "abertura_id": str(abertura[0]) if abertura else None,
            "fundo_troco": float(abertura[1]) if abertura else None,
            "aberto_em": abertura[2].isoformat() if abertura else None,
            "logs_edicao": logs,
        })

    return {"data": data.isoformat(), "motoristas": resultado}


@router.get(
    "/abertura/{abertura_id}/produtos",
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_abertura_produtos(session: SessionDep, abertura_id: str) -> Any:
    """Retorna todos os produtos do catalogo com a quantidade carregada
    nesta abertura (0 se nao estava na carga original).
    Usado pelo modal de edicao para montar os campos editaveis."""
    conn = session.connection()

    # Todos os produtos do catalogo
    todos = conn.execute(sa.text(
        "SELECT id, title FROM item ORDER BY title"
    )).fetchall()

    # Quantidades desta abertura
    carga = conn.execute(sa.text(
        "SELECT produto_id, quantidade FROM abertura_dia_produto WHERE abertura_id = :id"
    ), {"id": abertura_id}).fetchall()
    carga_map = {str(r[0]): r[1] for r in carga}

    return [
        {
            "produto_id": str(p[0]),
            "produto_nome": p[1],
            "quantidade": carga_map.get(str(p[0]), 0),
        }
        for p in todos
    ]


@router.post(
    "/abertura",
    dependencies=[Depends(require_module_permission(MODULE, action="create"))],
)
def criar_abertura(*, session: SessionDep, current_user: CurrentUser, body: dict) -> Any:
    motorista_id = body.get("motorista_id")
    fundo_troco = Decimal(str(body.get("fundo_troco", 0)))
    data_abertura = date.fromisoformat(body["data"]) if body.get("data") else date.today()

    if not motorista_id:
        raise HTTPException(status_code=400, detail="motorista_id e obrigatorio")
    if fundo_troco <= 0:
        raise HTTPException(status_code=400, detail="Fundo de troco deve ser maior que zero")

    conn = session.connection()
    existente = conn.execute(sa.text(
        "SELECT id FROM abertura_dia WHERE motorista_id = :mid AND data = :data"
    ), {"mid": motorista_id, "data": data_abertura}).fetchone()
    if existente:
        raise HTTPException(status_code=400, detail="Ja existe uma abertura para este motorista nesta data")

    conta_motorista_id = _get_or_create_conta_motorista(session, motorista_id)

    abertura_id = str(uuid.uuid4())
    conn.execute(sa.text(
        "INSERT INTO abertura_dia (id, motorista_id, data, fundo_troco, aberto_por_id, created_at) "
        "VALUES (:id, :motorista_id, :data, :fundo_troco, :aberto_por_id, NOW())"
    ), {"id": abertura_id, "motorista_id": motorista_id, "data": data_abertura,
        "fundo_troco": fundo_troco, "aberto_por_id": str(current_user.id)})

    _criar_lancamento(session, data=data_abertura,
        descricao="Abertura do dia - fundo de troco",
        valor=fundo_troco, debito_id=CONTA_MESTRE_ID,
        credito_id=conta_motorista_id, abertura_id=abertura_id,
        criado_por_id=str(current_user.id))

    produtos = body.get("produtos", [])
    for p in produtos:
        if p.get("quantidade", 0) > 0:
            conn.execute(sa.text(
                "INSERT INTO abertura_dia_produto (id, abertura_id, produto_id, quantidade) "
                "VALUES (:id, :abertura_id, :produto_id, :quantidade) ON CONFLICT DO NOTHING"
            ), {"id": str(uuid.uuid4()), "abertura_id": abertura_id,
                "produto_id": p["produto_id"], "quantidade": p["quantidade"]})

    session.commit()
    return {"abertura_id": abertura_id, "conta_motorista_id": conta_motorista_id}


@router.patch(
    "/abertura/{abertura_id}",
    dependencies=[Depends(require_module_permission(MODULE, action="update"))],
)
def editar_abertura(*, session: SessionDep, current_user: CurrentUser, abertura_id: str, body: dict) -> Any:
    """Edita fundo de troco e/ou produtos de uma abertura ja confirmada.
    Grava log de cada campo alterado. Cria lancamento contabil de ajuste
    para diferenca no fundo de troco.

    Body aceita:
        novo_fundo_troco: float (opcional -- se omitido ou igual ao atual, nao altera)
        produtos: list[{produto_id, produto_nome, quantidade}] (opcional)
    """
    conn = session.connection()
    abertura = conn.execute(sa.text(
        "SELECT id, motorista_id, data, fundo_troco FROM abertura_dia WHERE id = :id"
    ), {"id": abertura_id}).fetchone()
    if not abertura:
        raise HTTPException(status_code=404, detail="Abertura nao encontrada")

    editor_id = str(current_user.id)
    houve_alteracao = False

    # --- Fundo de troco ---
    novo_fundo_raw = body.get("novo_fundo_troco")
    if novo_fundo_raw is not None:
        novo_fundo = Decimal(str(novo_fundo_raw))
        if novo_fundo <= 0:
            raise HTTPException(status_code=400, detail="Fundo de troco deve ser maior que zero")

        fundo_atual = Decimal(str(abertura[3]))
        diferenca = novo_fundo - fundo_atual

        if diferenca != 0:
            conta_motorista = conn.execute(sa.text(
                "SELECT id FROM conta WHERE motorista_id = :mid"
            ), {"mid": str(abertura[1])}).fetchone()
            if not conta_motorista:
                raise HTTPException(status_code=400, detail="Conta do motorista nao encontrada")

            conn.execute(sa.text(
                "UPDATE abertura_dia SET fundo_troco = :novo, updated_at = NOW(), editado_por_id = :editor WHERE id = :id"
            ), {"novo": novo_fundo, "editor": editor_id, "id": abertura_id})

            _gravar_log_edicao(conn, abertura_id=abertura_id, campo="fundo_troco",
                valor_anterior=f"R$ {fundo_atual:,.2f}",
                valor_novo=f"R$ {novo_fundo:,.2f}",
                editado_por_id=editor_id)

            if diferenca > 0:
                debito_id, credito_id = CONTA_MESTRE_ID, str(conta_motorista[0])
                descricao = f"{PREFIXO_AJUSTE_ABERTURA} - acrescimo de fundo de troco"
                valor_ajuste = diferenca
            else:
                debito_id, credito_id = str(conta_motorista[0]), CONTA_MESTRE_ID
                descricao = f"{PREFIXO_AJUSTE_ABERTURA} - reducao de fundo de troco"
                valor_ajuste = abs(diferenca)

            _criar_lancamento(session, data=abertura[2], descricao=descricao,
                valor=valor_ajuste, debito_id=debito_id, credito_id=credito_id,
                abertura_id=abertura_id, criado_por_id=editor_id)

            houve_alteracao = True

    # --- Produtos ---
    produtos_novos = body.get("produtos")
    if produtos_novos is not None:
        # Carga atual para comparar
        carga_atual = conn.execute(sa.text(
            "SELECT produto_id, quantidade FROM abertura_dia_produto WHERE abertura_id = :id"
        ), {"id": abertura_id}).fetchall()
        carga_map = {str(r[0]): r[1] for r in carga_atual}

        for p in produtos_novos:
            pid = p["produto_id"]
            nome_produto = p.get("produto_nome", pid)
            qtd_nova = int(p.get("quantidade", 0))
            qtd_atual = carga_map.get(pid, 0)

            if qtd_nova == qtd_atual:
                continue  # sem alteracao

            # Grava log
            _gravar_log_edicao(conn, abertura_id=abertura_id,
                campo=f"produto:{nome_produto}",
                valor_anterior=str(qtd_atual),
                valor_novo=str(qtd_nova),
                editado_por_id=editor_id)

            if qtd_nova == 0:
                # Remove da carga
                conn.execute(sa.text(
                    "DELETE FROM abertura_dia_produto WHERE abertura_id = :aid AND produto_id = :pid"
                ), {"aid": abertura_id, "pid": pid})
            elif qtd_atual == 0:
                # Insere novo
                conn.execute(sa.text(
                    "INSERT INTO abertura_dia_produto (id, abertura_id, produto_id, quantidade) "
                    "VALUES (:id, :aid, :pid, :qtd)"
                ), {"id": str(uuid.uuid4()), "aid": abertura_id, "pid": pid, "qtd": qtd_nova})
            else:
                # Atualiza
                conn.execute(sa.text(
                    "UPDATE abertura_dia_produto SET quantidade = :qtd "
                    "WHERE abertura_id = :aid AND produto_id = :pid"
                ), {"qtd": qtd_nova, "aid": abertura_id, "pid": pid})

            # Marca abertura como editada
            conn.execute(sa.text(
                "UPDATE abertura_dia SET updated_at = NOW(), editado_por_id = :editor WHERE id = :id"
            ), {"editor": editor_id, "id": abertura_id})

            houve_alteracao = True

    if not houve_alteracao:
        raise HTTPException(status_code=400, detail="Nenhuma alteracao detectada")

    session.commit()
    return {"abertura_id": abertura_id, "ok": True}


@router.post("/verificar-senha-gerente")
def verificar_senha_gerente(*, session: SessionDep, body: dict) -> Any:
    from app.core.security import verify_password
    email = body.get("email", "").strip().lower()
    senha = body.get("senha", "")
    if not email or not senha:
        raise HTTPException(status_code=400, detail="Email e senha sao obrigatorios")
    conn = session.connection()
    sql_gerente = (
        'SELECT u.id, u.hashed_password, u.is_active '
        'FROM "user" u '
        'JOIN user_role ur ON ur.user_id = u.id '
        'JOIN role r ON r.id = ur.role_id '
        "WHERE LOWER(u.email) = :email AND LOWER(r.name) IN ('gerente', 'admin') LIMIT 1"
    )
    gerente = conn.execute(sa.text(sql_gerente), {"email": email}).fetchone()
    if not gerente:
        raise HTTPException(status_code=403, detail="Usuario nao encontrado ou sem permissao de gerente")
    if not gerente[2]:
        raise HTTPException(status_code=403, detail="Usuario inativo")
    if not verify_password(senha, gerente[1]):
        raise HTTPException(status_code=403, detail="Senha incorreta")
    return {"autorizado": True, "gerente_id": str(gerente[0])}


# ---------------------------------------------------------------------------
# Resumo e Fechamento
# ---------------------------------------------------------------------------

@router.get(
    "/resumo/{motorista_id}/{data}",
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_resumo_fechamento(session: SessionDep, motorista_id: str, data: date) -> Any:
    conn = session.connection()

    abertura = conn.execute(sa.text(
        "SELECT id, fundo_troco FROM abertura_dia WHERE motorista_id = :mid AND data = :data"
    ), {"mid": motorista_id, "data": data}).fetchone()
    if not abertura:
        raise HTTPException(status_code=400, detail="Nao ha abertura registrada para este motorista nesta data")

    fechado = conn.execute(sa.text(
        "SELECT id FROM fechamento_dia WHERE motorista_id = :mid AND data = :data"
    ), {"mid": motorista_id, "data": data}).fetchone()

    totais = conn.execute(sa.text(
        "SELECT forma_pagamento, SUM(valor_pago) FROM venda "
        "WHERE motorista_id = :mid AND data_venda = :data GROUP BY forma_pagamento"
    ), {"mid": motorista_id, "data": data}).fetchall()

    total_dinheiro = Decimal("0")
    total_pix = Decimal("0")
    total_debito = Decimal("0")
    total_credito = Decimal("0")
    total_fiado = Decimal("0")

    for forma, valor in totais:
        v = Decimal(str(valor))
        if forma == "dinheiro": total_dinheiro = v
        elif forma == "pix": total_pix = v
        elif forma == "cartao_debito": total_debito = v
        elif forma == "cartao_credito": total_credito = v
        elif forma == "vale": total_fiado = v

    fundo_troco = Decimal(str(abertura[1]))
    total_esperado = fundo_troco + total_dinheiro

    vendas = conn.execute(sa.text(
        "SELECT v.id, c.nome, v.forma_pagamento, v.valor_pago, v.data_venda "
        "FROM venda v JOIN cliente c ON c.id = v.cliente_id "
        "WHERE v.motorista_id = :mid AND v.data_venda = :data ORDER BY v.created_at"
    ), {"mid": motorista_id, "data": data}).fetchall()

    carga = conn.execute(sa.text(
        "SELECT adp.produto_id, i.title, adp.quantidade "
        "FROM abertura_dia_produto adp JOIN item i ON i.id = adp.produto_id "
        "WHERE adp.abertura_id = :abertura_id"
    ), {"abertura_id": str(abertura[0])}).fetchall()

    return {
        "abertura_id": str(abertura[0]),
        "carga_produtos": [{"produto_id": str(c[0]), "produto_nome": c[1], "carregado": c[2]} for c in carga],
        "fundo_troco": float(fundo_troco),
        "total_dinheiro": float(total_dinheiro),
        "total_pix": float(total_pix),
        "total_debito": float(total_debito),
        "total_credito": float(total_credito),
        "total_fiado": float(total_fiado),
        "total_esperado": float(total_esperado),
        "total_geral": float(total_dinheiro + total_pix + total_debito + total_credito + total_fiado),
        "ja_fechado": fechado is not None,
        "vendas": [{"id": str(v[0]), "cliente_nome": v[1], "forma_pagamento": v[2],
                    "valor_pago": float(v[3]), "data_venda": v[4].isoformat()} for v in vendas],
    }


@router.post(
    "/fechar",
    dependencies=[Depends(require_module_permission(MODULE, action="create"))],
)
def fechar_dia(*, session: SessionDep, current_user: CurrentUser, body: dict) -> Any:
    motorista_id = body.get("motorista_id")
    data_str = body.get("data")
    abertura_id = body.get("abertura_id")
    contagem = body.get("contagem_especie", {})
    total_contado = Decimal(str(body.get("total_contado", 0)))
    justificativa = (body.get("justificativa") or "").strip()

    if not all([motorista_id, data_str, abertura_id]):
        raise HTTPException(status_code=400, detail="motorista_id, data e abertura_id sao obrigatorios")

    data_fechamento = date.fromisoformat(data_str)
    conn = session.connection()

    ja_fechado = conn.execute(sa.text(
        "SELECT id FROM fechamento_dia WHERE motorista_id = :mid AND data = :data"
    ), {"mid": motorista_id, "data": data_fechamento}).fetchone()
    if ja_fechado:
        raise HTTPException(status_code=400, detail="Este dia ja foi fechado para este motorista")

    abertura = conn.execute(sa.text(
        "SELECT id, fundo_troco FROM abertura_dia WHERE id = :id AND motorista_id = :mid AND data = :data"
    ), {"id": abertura_id, "mid": motorista_id, "data": data_fechamento}).fetchone()
    if not abertura:
        raise HTTPException(status_code=404, detail="Abertura nao encontrada")

    totais = conn.execute(sa.text(
        "SELECT forma_pagamento, SUM(valor_pago) FROM venda "
        "WHERE motorista_id = :mid AND data_venda = :data GROUP BY forma_pagamento"
    ), {"mid": motorista_id, "data": data_fechamento}).fetchall()

    t = {"dinheiro": Decimal("0"), "pix": Decimal("0"), "cartao_debito": Decimal("0"),
         "cartao_credito": Decimal("0"), "vale": Decimal("0")}
    for forma, valor in totais:
        if forma in t:
            t[forma] = Decimal(str(valor))

    fundo_troco = Decimal(str(abertura[1]))
    total_esperado = fundo_troco + t["dinheiro"]
    diferenca = total_contado - total_esperado

    if abs(diferenca) >= Decimal("0.01") and not justificativa:
        raise HTTPException(status_code=400, detail="Justificativa obrigatoria quando ha diferenca de caixa")

    conta_motorista = conn.execute(sa.text(
        "SELECT id FROM conta WHERE motorista_id = :mid"
    ), {"mid": motorista_id}).fetchone()
    if not conta_motorista:
        raise HTTPException(status_code=400, detail="Conta do motorista nao encontrada")
    conta_motorista_id = str(conta_motorista[0])

    fechamento_id = str(uuid.uuid4())
    conn.execute(sa.text(
        "INSERT INTO fechamento_dia "
        "(id, abertura_id, motorista_id, data, total_dinheiro, total_pix, total_debito, "
        "total_credito, total_fiado, contagem_especie, total_contado, total_esperado, "
        "diferenca, justificativa, fechado_por_id, created_at) "
        "VALUES (:id, :abertura_id, :motorista_id, :data, :td, :tp, :tdb, :tcr, :tf, "
        "CAST(:contagem AS json), :total_contado, :total_esperado, :diferenca, :justificativa, :fechado_por_id, NOW())"
    ), {
        "id": fechamento_id, "abertura_id": abertura_id, "motorista_id": motorista_id,
        "data": data_fechamento, "td": t["dinheiro"], "tp": t["pix"],
        "tdb": t["cartao_debito"], "tcr": t["cartao_credito"], "tf": t["vale"],
        "contagem": json.dumps({str(k): v for k, v in contagem.items()}),
        "total_contado": total_contado, "total_esperado": total_esperado,
        "diferenca": diferenca, "justificativa": justificativa or None,
        "fechado_por_id": str(current_user.id),
    })

    if total_contado > 0:
        _criar_lancamento(session, data=data_fechamento,
            descricao="Fechamento - dinheiro fisico entregue", valor=total_contado,
            debito_id=conta_motorista_id, credito_id=CONTA_MESTRE_ID,
            abertura_id=abertura_id, criado_por_id=str(current_user.id))

    if t["pix"] > 0:
        _criar_lancamento(session, data=data_fechamento,
            descricao="Fechamento - Pix recebido", valor=t["pix"],
            debito_id=conta_motorista_id, credito_id=CONTA_MESTRE_ID,
            abertura_id=abertura_id, criado_por_id=str(current_user.id))

    if t["cartao_debito"] > 0:
        _criar_lancamento(session, data=data_fechamento,
            descricao="Fechamento - cartao debito (maquininha)", valor=t["cartao_debito"],
            debito_id=conta_motorista_id, credito_id=CONTA_MAQUININHA_ID,
            abertura_id=abertura_id, criado_por_id=str(current_user.id))

    if t["cartao_credito"] > 0:
        _criar_lancamento(session, data=data_fechamento,
            descricao="Fechamento - cartao credito (maquininha)", valor=t["cartao_credito"],
            debito_id=conta_motorista_id, credito_id=CONTA_MAQUININHA_ID,
            abertura_id=abertura_id, criado_por_id=str(current_user.id))

    if abs(diferenca) >= Decimal("0.01"):
        if diferenca < 0:
            _criar_lancamento(session, data=data_fechamento,
                descricao=f"Quebra de caixa - {justificativa[:100]}",
                valor=abs(diferenca), debito_id=CONTA_QUEBRA_ID,
                credito_id=conta_motorista_id, abertura_id=abertura_id,
                criado_por_id=str(current_user.id))
        else:
            _criar_lancamento(session, data=data_fechamento,
                descricao=f"Sobra de caixa - {justificativa[:100]}",
                valor=diferenca, debito_id=conta_motorista_id,
                credito_id=CONTA_SOBRA_ID, abertura_id=abertura_id,
                criado_por_id=str(current_user.id))

    retornos = body.get("retorno_produtos", [])
    for r in retornos:
        if r.get("quantidade_retorno", 0) >= 0:
            conn.execute(sa.text(
                "INSERT INTO fechamento_dia_produto (id, fechamento_id, produto_id, quantidade_retorno) "
                "VALUES (:id, :fechamento_id, :produto_id, :quantidade_retorno) ON CONFLICT DO NOTHING"
            ), {"id": str(uuid.uuid4()), "fechamento_id": fechamento_id,
                "produto_id": r["produto_id"], "quantidade_retorno": r["quantidade_retorno"]})

    session.commit()
    return {"fechamento_id": fechamento_id, "total_esperado": float(total_esperado),
            "total_contado": float(total_contado), "diferenca": float(diferenca)}


# ---------------------------------------------------------------------------
# Dashboard de saldos
# ---------------------------------------------------------------------------

@router.get(
    "/dashboard",
    dependencies=[Depends(require_module_permission(MODULE, action="read"))],
)
def read_dashboard(session: SessionDep, periodo: str = "hoje") -> Any:
    hoje = date.today()

    if periodo == "semana":
        dow = (hoje.weekday() + 1) % 7
        data_inicio = hoje - timedelta(days=dow)
    elif periodo == "mes":
        data_inicio = hoje.replace(day=1)
    elif periodo == "ano":
        data_inicio = hoje.replace(month=1, day=1)
    else:
        data_inicio = hoje

    conn = session.connection()

    saldo_mestre = _saldo_conta(conn, CONTA_MESTRE_ID, data_inicio, hoje)
    saldo_fiado = abs(_saldo_conta(conn, CONTA_FIADO_ID, data_inicio, hoje))
    saldo_maquininha = abs(_saldo_conta(conn, CONTA_MAQUININHA_ID, data_inicio, hoje))

    contas_transito = conn.execute(sa.text(
        "SELECT id, motorista_id FROM conta WHERE pai_id = :pai AND ativo = true"
    ), {"pai": CONTA_TRANSITO_ID}).fetchall()

    total_transito = 0.0
    motoristas_saldo = []
    ids_com_conta: set = set()

    for ct in contas_transito:
        s = _saldo_conta(conn, str(ct[0]), data_inicio, hoje)
        total_transito += s
        mid = str(ct[1])
        ids_com_conta.add(mid)

        motorista = conn.execute(sa.text(SQL_USER_BY_ID), {"uid": mid}).fetchone()
        nome = motorista[0] or motorista[1] if motorista else "Motorista"

        abertura = conn.execute(sa.text(
            "SELECT id, fundo_troco FROM abertura_dia WHERE motorista_id = :mid AND data = :data"
        ), {"mid": mid, "data": hoje}).fetchone()
        fechamento = conn.execute(sa.text(
            "SELECT id FROM fechamento_dia WHERE motorista_id = :mid AND data = :data"
        ), {"mid": mid, "data": hoje}).fetchone()

        status = "fechado" if fechamento else ("aberto" if abertura else "sem_abertura")
        iniciais = "".join(p[0].upper() for p in nome.split()[:2])

        motoristas_saldo.append({
            "motorista_id": mid, "motorista_nome": nome, "iniciais": iniciais,
            "status": status, "fundo_troco": float(abertura[1]) if abertura else 0,
            "saldo_transito": s,
        })

    todos_motoristas = conn.execute(sa.text(SQL_MOTORISTAS)).fetchall()
    for tm in todos_motoristas:
        mid = str(tm[0])
        if mid in ids_com_conta:
            continue
        nome = tm[1] or tm[2]
        iniciais = "".join(p[0].upper() for p in nome.split()[:2])
        abertura = conn.execute(sa.text(
            "SELECT id FROM abertura_dia WHERE motorista_id = :mid AND data = :data"
        ), {"mid": mid, "data": hoje}).fetchone()
        motoristas_saldo.append({
            "motorista_id": mid, "motorista_nome": nome, "iniciais": iniciais,
            "status": "aberto" if abertura else "sem_abertura",
            "fundo_troco": 0, "saldo_transito": 0.0,
        })

    motoristas_saldo.sort(key=lambda m: m["motorista_nome"])

    lancamentos = conn.execute(sa.text(
        "SELECT lc.descricao, cd.numero, cc.numero, lc.valor, lc.created_at "
        "FROM lancamento_contabil lc "
        "JOIN conta cd ON cd.id = lc.debito_id "
        "JOIN conta cc ON cc.id = lc.credito_id "
        "WHERE lc.data >= :inicio AND lc.data <= :fim "
        "ORDER BY lc.created_at DESC LIMIT 15"
    ), {"inicio": data_inicio, "fim": hoje}).fetchall()

    return {
        "periodo": periodo,
        "data_inicio": data_inicio.isoformat(),
        "data_fim": hoje.isoformat(),
        "resumo": {
            "saldo_mestre": saldo_mestre, "total_transito": total_transito,
            "total_fiado": saldo_fiado, "total_maquininha": saldo_maquininha,
        },
        "motoristas": motoristas_saldo,
        "lancamentos": [
            {
                "descricao": l[0], "debito_numero": l[1], "credito_numero": l[2],
                "valor": float(l[3]), "hora": l[4].strftime("%H:%M"),
                "e_ajuste": l[0].startswith(PREFIXO_AJUSTE_ABERTURA),
            }
            for l in lancamentos
        ],
    }
