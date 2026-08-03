"""
change_control.py — camada de controle de mudanças (harness) do mcp-local-erp.

Objetivo: impedir que write_file escreva qualquer coisa sem que antes exista
um plano de mudança (feature + descrição + lista de arquivos) aprovado
explicitamente pelo usuário. Isso vira uma restrição do servidor, não uma
"boa prática" que depende de o assistente lembrar de segui-la.

Fluxo de duas fases:

    1. propose_change(feature, description, files)  -> plano "pending"
    2. approve_change(plan_id)                       -> plano "approved"
    3. write_file(rel_path, content, plan_id, ...)    -> só roda se o plano
       estiver aprovado E rel_path estiver na lista de files do plano.

Estado persistido em `mcp_state.json` (planos e status) e log append-only em
`mcp_audit.jsonl` (todo evento: propose / approve / reject / write), ambos
na raiz do projeto (ROOT), sobrevivendo a reinícios do Claude Desktop.
"""

import json
import time
import uuid
from pathlib import Path

STATE_FILE = "mcp_state.json"
AUDIT_FILE = "mcp_audit.jsonl"

# Estilo de comentário de linha por extensão. None = tratado como bloco (HTML/MD).
COMMENT_STYLES = {
    ".py": "#", ".yaml": "#", ".yml": "#", ".sh": "#", ".toml": "#", ".cfg": "#",
    ".js": "//", ".ts": "//", ".jsx": "//", ".tsx": "//", ".java": "//", ".go": "//", ".css": "//",
}
BLOCK_COMMENT_EXT = {".html", ".htm", ".md"}


def _state_path(harness_root: Path) -> Path:
    return harness_root / STATE_FILE


def _audit_path(harness_root: Path) -> Path:
    return harness_root / AUDIT_FILE


def _load_state(harness_root: Path) -> dict:
    p = _state_path(harness_root)
    if not p.exists():
        return {"plans": {}}
    return json.loads(p.read_text(encoding="utf-8"))


def _save_state(harness_root: Path, state: dict) -> None:
    _state_path(harness_root).write_text(
        json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def _append_audit(harness_root: Path, entry: dict) -> None:
    entry = {"ts": time.strftime("%Y-%m-%d %H:%M:%S"), **entry}
    with _audit_path(harness_root).open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def propose_change(harness_root: Path, feature: str, description: str, files: list[str]) -> dict:
    """Registra um plano pendente de aprovação e devolve o plano (com plan_id).

    `harness_root` é a pasta do PRÓPRIO mcp-local-erp (Path(__file__).parent
    em server.py) — não a raiz do projeto que ele lê/escreve (ROOT). Isso
    mantém mcp_state.json/mcp_audit.jsonl sempre dentro da pasta do servidor,
    nunca vazando para dentro do projeto do cliente."""
    state = _load_state(harness_root)
    plan_id = uuid.uuid4().hex[:8]
    plan = {
        "plan_id": plan_id,
        "feature": feature,
        "description": description,
        "files": files,
        "status": "pending",
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "approved_at": None,
        "writes": [],
    }
    state["plans"][plan_id] = plan
    _save_state(harness_root, state)
    _append_audit(harness_root, {"event": "propose", "plan_id": plan_id, "feature": feature, "files": files})
    return plan


def approve_change(harness_root: Path, plan_id: str) -> dict:
    state = _load_state(harness_root)
    plan = state["plans"].get(plan_id)
    if plan is None:
        raise ValueError(f"Plano '{plan_id}' não encontrado.")
    plan["status"] = "approved"
    plan["approved_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    _save_state(harness_root, state)
    _append_audit(harness_root, {"event": "approve", "plan_id": plan_id})
    return plan


def reject_change(harness_root: Path, plan_id: str) -> dict:
    state = _load_state(harness_root)
    plan = state["plans"].get(plan_id)
    if plan is None:
        raise ValueError(f"Plano '{plan_id}' não encontrado.")
    plan["status"] = "rejected"
    _save_state(harness_root, state)
    _append_audit(harness_root, {"event": "reject", "plan_id": plan_id})
    return plan


def list_plans(harness_root: Path, status: str | None = None) -> list[dict]:
    state = _load_state(harness_root)
    plans = list(state["plans"].values())
    if status:
        plans = [p for p in plans if p["status"] == status]
    return plans


# Nomes de arquivo reservados do próprio harness — nunca podem ser alvo de
# write_file, mesmo com plano aprovado, pois isso corromperia o estado ou o
# log de auditoria do harness por dentro do próprio fluxo que ele controla.
RESERVED_FILENAMES = {STATE_FILE, AUDIT_FILE}


def check_authorized(harness_root: Path, plan_id: str, rel_path: str) -> dict:
    """Levanta erro se o plano não existir, não estiver aprovado, não cobrir
    o path, ou se o path apontar para um arquivo interno reservado do harness."""
    if Path(rel_path).name in RESERVED_FILENAMES:
        raise ValueError(
            f"'{rel_path}' é um arquivo interno do harness (estado/auditoria) "
            f"e não pode ser escrito via write_file."
        )
    state = _load_state(harness_root)
    plan = state["plans"].get(plan_id)
    if plan is None:
        raise ValueError(f"Plano '{plan_id}' não encontrado. Chame propose_change primeiro.")
    if plan["status"] != "approved":
        raise ValueError(
            f"Plano '{plan_id}' está com status '{plan['status']}', não 'approved'. "
            f"Peça a aprovação explícita ao usuário e então chame approve_change."
        )
    if rel_path not in plan["files"]:
        raise ValueError(
            f"Arquivo '{rel_path}' não está no escopo declarado do plano '{plan_id}' "
            f"({plan['files']}). Proponha um novo plano cobrindo este arquivo."
        )
    return plan


def register_write(harness_root: Path, plan_id: str, rel_path: str) -> None:
    state = _load_state(harness_root)
    state["plans"][plan_id]["writes"].append(
        {"path": rel_path, "at": time.strftime("%Y-%m-%d %H:%M:%S")}
    )
    _save_state(harness_root, state)
    _append_audit(harness_root, {"event": "write", "plan_id": plan_id, "path": rel_path})


def _traceability_text(feature: str, description: str, plan_id: str) -> str:
    stamp = time.strftime("%Y-%m-%d %H:%M:%S")
    return f"[mcp-local harness] feature: {feature} | plano: {plan_id} | {stamp}\n{description}"


def inject_comment(rel_path: str, content: str, feature: str, description: str, plan_id: str) -> str:
    """Prefixa o conteúdo com um bloco de comentário de rastreabilidade, no
    estilo correto para a extensão do arquivo."""
    ext = Path(rel_path).suffix
    text = _traceability_text(feature, description, plan_id)
    if ext in BLOCK_COMMENT_EXT:
        header = f"<!--\n{text}\n-->\n"
    else:
        prefix = COMMENT_STYLES.get(ext, "#")
        header = "\n".join(f"{prefix} {line}" for line in text.splitlines()) + "\n"
    return header + content
