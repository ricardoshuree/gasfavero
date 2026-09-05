#!/usr/bin/env python3
"""
start.py — Inicializador do ambiente erp-gasfavero.
Raiz do projeto: C:/project-claude/erp-gasfavero/

O que faz:
  1. Garante psutil instalado (roda uv sync automaticamente se necessario)
  2. Ativa o venv e verifica dependencias
  3. Garante que o MCP mcp-erp-gasfavero esta registrado no Claude Desktop
  4. Sobe backend (FastAPI) e frontend (React/Vite) em janelas separadas

Uso:
  python start.py           # sobe tudo
  python start.py mcp       # so registra/reinicia o MCP
  python start.py dev       # so sobe backend + frontend
  python start.py restart   # reinicia o processo MCP (recarrega config.yaml)
"""
import json
import os
import platform
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT  = Path(__file__).parent.resolve()
MCP_DIR = ROOT / "mcp-local"

# ── Cores ANSI (mesmo padrao do mcp-local/start.py) ───────────────────────────
WHITE  = "\033[38;5;15m"
GREEN  = "\033[38;5;46m"
BLUE   = "\033[38;5;51m"
RED    = "\033[38;5;196m"
ORANGE = "\033[38;5;208m"
RESET  = "\033[0m"

if platform.system() == "Windows":
    os.system("")

def _t(msg=""): print(f"{BLUE}{msg}{RESET}")       # titulo
def _i(msg=""): print(f"{WHITE}{msg}{RESET}")       # info
def _ok(msg=""): print(f"{GREEN}{msg}{RESET}")      # sucesso
def _w(msg=""): print(f"{RED}{msg}{RESET}")         # aviso
def _fin(msg=""): print(f"{ORANGE}{msg}{RESET}")    # conclusao
def _p(label, val): print(f"{BLUE}{label}{RESET} {WHITE}{val}{RESET}")
def _blank(): print()


# ── 1. Garante psutil ─────────────────────────────────────────────────────────
def _garantir_psutil():
    """
    Garante psutil no venv ativo. psutil eh dependencia do mcp-local/,
    nao da raiz do projeto — por isso uv sync na raiz nao o instala.
    Usamos uv pip install diretamente no ambiente ativo.
    """
    try:
        import psutil  # noqa
        return
    except ImportError:
        pass
    _w("psutil nao encontrado — instalando via uv pip install...")
    uv = shutil.which("uv") or "uv"
    # Instala no ambiente ativo (venv da raiz ou sistema)
    r = subprocess.run([uv, "pip", "install", "psutil>=6.0"], cwd=ROOT)
    if r.returncode != 0:
        _w("Falha ao instalar psutil. Tente manualmente: uv pip install psutil")
        sys.exit(1)
    # Forca reimport apos instalacao
    import importlib, site
    importlib.invalidate_caches()
    # Adiciona site-packages do venv ao path se necessario
    venv_site = ROOT / ".venv" / "Lib" / "site-packages"
    if venv_site.exists() and str(venv_site) not in sys.path:
        sys.path.insert(0, str(venv_site))
    try:
        import psutil  # noqa
        _ok("psutil instalado com sucesso.")
    except ImportError:
        _w("psutil instalado mas nao encontrado no sys.path atual.")
        _i("Execute: . .\\activate.ps1  e tente novamente.")
        sys.exit(1)


# ── 2. Registro do MCP no Claude Desktop ──────────────────────────────────────
def _get_claude_config_path():
    """Detecta claude_desktop_config.json (MSIX ou instalacao tradicional)."""
    local   = Path(os.environ.get("LOCALAPPDATA", ""))
    roaming = Path(os.environ.get("APPDATA", ""))
    candidatos = []
    packages = local / "Packages"
    if packages.exists():
        for pasta in packages.iterdir():
            if pasta.name.startswith("Claude_") and pasta.is_dir():
                candidatos.append(
                    pasta / "LocalCache" / "Roaming" / "Claude" / "claude_desktop_config.json"
                )
    candidatos.append(roaming / "Claude" / "claude_desktop_config.json")
    candidatos.append(local   / "Claude" / "claude_desktop_config.json")
    for c in candidatos:
        if c.exists() and c.stat().st_size > 10:
            return c
    for c in candidatos:
        if c.parent.exists():
            return c
    return candidatos[0]


def _registrar_mcp():
    """Garante que mcp-erp-gasfavero esta registrado no Claude Desktop."""
    import json, shutil as _sh
    import yaml

    cfg_path = MCP_DIR / "config.yaml"
    if not cfg_path.exists():
        _w(f"config.yaml nao encontrado em {MCP_DIR}")
        return
    cfg = yaml.safe_load(cfg_path.read_text(encoding="utf-8"))
    project_name = cfg["project_name"]

    claude_cfg = _get_claude_config_path()
    claude_cfg.parent.mkdir(parents=True, exist_ok=True)

    if claude_cfg.exists():
        data = json.loads(claude_cfg.read_text(encoding="utf-8").strip() or "{}")
    else:
        data = {}
    data.setdefault("mcpServers", {})

    if project_name in data["mcpServers"]:
        _ok(f"'{project_name}' ja esta registrado no Claude Desktop.")
        return

    # Backup antes de editar
    if claude_cfg.exists():
        _sh.copy(claude_cfg, claude_cfg.with_suffix(".json.bak"))

    uv_path = shutil.which("uv") or "uv"
    data["mcpServers"][project_name] = {
        "command": uv_path,
        "args": ["run", "--directory", str(MCP_DIR), "server.py"],
    }
    claude_cfg.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    _ok(f"'{project_name}' registrado com sucesso.")
    _fin("Reinicie o Claude Desktop para carregar o servidor MCP.")


def _restart_mcp():
    """Mata o processo server.py do MCP para forcar recarga do config.yaml."""
    try:
        import psutil
    except ImportError:
        _w("psutil nao disponivel.")
        return
    alvo = str((MCP_DIR / "server.py").resolve()).lower()
    encontrados = []
    for proc in psutil.process_iter(["pid", "name", "cmdline"]):
        try:
            nome = (proc.info.get("name") or "").lower()
            if "python" not in nome and "uv" not in nome:
                continue
            cmd = " ".join(proc.info.get("cmdline") or []).lower()
            if alvo in cmd:
                encontrados.append(proc)
        except Exception:
            continue
    if not encontrados:
        _ok("Nenhuma instancia do servidor MCP rodando — nada a reiniciar.")
        return
    for p in encontrados:
        try:
            p.terminate()
            p.wait(timeout=3)
            _ok(f"PID {p.pid} encerrado. Reative o conector no Claude Desktop.")
        except Exception as e:
            _w(f"PID {p.pid}: {e}")


# ── 3. Sobe backend + frontend em janelas separadas ───────────────────────────
def _sobe_dev():
    if platform.system() != "Windows":
        _w("Abertura de janelas separadas so suportada no Windows.")
        _i("No Linux/Mac: rode backend e frontend manualmente em terminais separados.")
        return

    venv_activate = ROOT / ".venv" / "Scripts" / "Activate.ps1"
    backend_dir   = ROOT / "backend"
    frontend_dir  = ROOT / "frontend"

    # Escreve scripts .ps1 temporarios para evitar problemas de escape de
    # aspas no PowerShell ao passar -Command com paths que contem espacos
    # ou caracteres especiais. Start-Process -File nao tem esse problema.
    tmp_dir = ROOT / ".tmp_start"
    tmp_dir.mkdir(exist_ok=True)

    backend_ps1 = tmp_dir / "start_backend.ps1"
    backend_ps1.write_text(
        f". '{venv_activate}'\n"
        f"cd '{backend_dir}'\n"
        f"uv run uvicorn app.main:app --reload --port 8000\n",
        encoding="utf-8"
    )

    frontend_ps1 = tmp_dir / "start_frontend.ps1"
    frontend_ps1.write_text(
        f"cd '{frontend_dir}'\n"
        f"npm run dev\n",
        encoding="utf-8"
    )

    _t("Subindo backend em http://localhost:8000 ...")
    subprocess.Popen([
        "powershell",
        "-Command",
        f"Start-Process powershell -ArgumentList '-NoExit', '-File', '{backend_ps1}'"
    ])

    _t("Subindo frontend em http://localhost:5173 ...")
    subprocess.Popen([
        "powershell",
        "-Command",
        f"Start-Process powershell -ArgumentList '-NoExit', '-File', '{frontend_ps1}'"
    ])

    _blank()
    _ok("Ambiente de desenvolvimento iniciado:")
    _ok("  Backend:  http://localhost:8000")
    _ok("  API docs: http://localhost:8000/docs")
    _ok("  Frontend: http://localhost:5173")
    _blank()
    _fin("Feche as janelas abertas para encerrar os servidores.")
    _blank()
    _fin("Monitor MCP:  python monitor_mcp.py")


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    args = sys.argv[1:]

    _blank()
    _p("Projeto:", "erp-gasfavero")
    _p("Raiz:   ", str(ROOT))
    _blank()

    modo_mcp  = "mcp"     in args
    modo_dev  = "dev"     in args
    modo_rest = "restart" in args
    modo_all  = not (modo_mcp or modo_dev or modo_rest)

    # Sempre garante psutil antes de qualquer coisa
    _t("Verificando dependencias do venv...")
    _garantir_psutil()
    _blank()

    if modo_rest:
        _t("Reiniciando servidor MCP...")
        _restart_mcp()
        return

    if modo_all or modo_mcp:
        _t("Verificando registro do MCP no Claude Desktop...")
        _registrar_mcp()
        _blank()

    if modo_all or modo_dev:
        _sobe_dev()


if __name__ == "__main__":
    main()