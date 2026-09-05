import time
import sqlite3
import yaml
from pathlib import Path
from fastmcp import FastMCP
import change_control as cc

cfg = yaml.safe_load(Path(__file__).parent.joinpath("config.yaml").read_text())
ROOT = Path(cfg["root_path"]).resolve()
ALLOWED_EXT = set(cfg.get("allowed_extensions", []))
BLOCKED = set(cfg.get("blocked_dirs", []))
HARNESS_ROOT = Path(__file__).parent.resolve()

# ── Telemetria SQLite ──────────────────────────────────────────────────────────
# Grava cada tool call em mcp-local/monitor/tool_calls.db (mesmo formato do
# finops-focus) para ser consumida pelo monitor_mcp.py na raiz do projeto.
# A pasta monitor/ e o banco sao criados automaticamente no primeiro uso.
_TELEM_DIR = HARNESS_ROOT / "monitor"
_TELEM_DB  = _TELEM_DIR / "tool_calls.db"

def _init_telem():
    _TELEM_DIR.mkdir(exist_ok=True)
    con = sqlite3.connect(str(_TELEM_DB))
    con.execute(
        "CREATE TABLE IF NOT EXISTS tool_calls "
        "(id INTEGER PRIMARY KEY AUTOINCREMENT, "
        " ts REAL NOT NULL, "
        " tool TEXT NOT NULL, "
        " dur_ms REAL NOT NULL, "
        " ok INTEGER NOT NULL)"  # 1=ok, 0=erro
    )
    con.commit()
    con.close()

def _record_call(tool: str, dur_ms: float, ok: bool):
    try:
        con = sqlite3.connect(str(_TELEM_DB), timeout=2)
        con.execute(
            "INSERT INTO tool_calls (ts, tool, dur_ms, ok) VALUES (?, ?, ?, ?)",
            (time.time(), tool, round(dur_ms, 1), int(ok))
        )
        con.commit()
        con.close()
    except Exception:
        pass  # telemetria nunca quebra o fluxo principal

_init_telem()

# ── MCP server ─────────────────────────────────────────────────────────────────
mcp = FastMCP(cfg["project_name"])


def _safe_path(rel_path: str) -> Path:
    p = (ROOT / rel_path).resolve()
    if not str(p).startswith(str(ROOT)):
        raise ValueError("Caminho fora do escopo do projeto")
    if any(b in p.parts for b in BLOCKED):
        raise ValueError("Diretório bloqueado")
    return p


def _timed(tool_name: str, fn):
    """Executa fn(), grava telemetria, repropaga excecoes."""
    t0 = time.perf_counter()
    ok = True
    try:
        result = fn()
        return result
    except Exception:
        ok = False
        raise
    finally:
        dur_ms = (time.perf_counter() - t0) * 1000
        _record_call(tool_name, dur_ms, ok)


@mcp.tool
def read_file(rel_path: str) -> str:
    """Le o conteudo de um arquivo do projeto."""
    return _timed("read_file", lambda: _safe_path(rel_path).read_text(encoding="utf-8"))


@mcp.tool
def list_dir(rel_path: str = ".") -> list[str]:
    """Lista arquivos e pastas dentro do projeto."""
    def _run():
        p = _safe_path(rel_path)
        return [str(f.relative_to(ROOT)) for f in p.iterdir()]
    return _timed("list_dir", _run)


@mcp.tool
def propose_change(feature: str, description: str, files: list[str]) -> dict:
    """
    Primeiro passo, obrigatorio antes de qualquer write_file.
    Declare a feature/alteracao, uma descricao objetiva do proposito, e a
    lista de paths (relativos a raiz do projeto) que serao criados ou
    modificados. Retorna um plano pendente de aprovacao do usuario.
    """
    return _timed("propose_change", lambda: cc.propose_change(HARNESS_ROOT, feature, description, files))


@mcp.tool
def approve_change(plan_id: str) -> dict:
    """Aprova um plano previamente proposto, liberando write_file para os
    arquivos declarados nele. So chame isso depois de aprovacao explicita
    do usuario na conversa."""
    return _timed("approve_change", lambda: cc.approve_change(HARNESS_ROOT, plan_id))


@mcp.tool
def reject_change(plan_id: str) -> dict:
    """Rejeita/cancela um plano pendente."""
    return _timed("reject_change", lambda: cc.reject_change(HARNESS_ROOT, plan_id))


@mcp.tool
def list_pending_changes(status: str = "pending") -> list[dict]:
    """Lista planos por status: 'pending', 'approved' ou 'rejected'."""
    return _timed("list_pending_changes", lambda: cc.list_plans(HARNESS_ROOT, status))


@mcp.tool
def write_file(rel_path: str, content: str, plan_id: str, feature: str, description: str) -> str:
    """
    Escreve/sobrescreve um arquivo do projeto.
    Requer um plan_id ja aprovado (via propose_change + approve_change) cujo
    escopo inclua rel_path. O conteudo salvo recebe automaticamente um
    comentario de rastreabilidade no topo (feature, plano, data/hora).
    """
    def _run():
        cc.check_authorized(HARNESS_ROOT, plan_id, rel_path)
        p = _safe_path(rel_path)
        if p.suffix and p.suffix not in ALLOWED_EXT:
            raise ValueError(f"Extensao nao permitida: {p.suffix}")
        final_content = cc.inject_comment(rel_path, content, feature, description, plan_id)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(final_content, encoding="utf-8")
        cc.register_write(HARNESS_ROOT, plan_id, rel_path)
        return f"Arquivo salvo: {rel_path} (plano {plan_id})"
    return _timed("write_file", _run)


if __name__ == "__main__":
    mcp.run()
