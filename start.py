"""
start.py — Garante que ESTE servidor MCP esteja registrado no Claude Desktop.

Papel deste script:
- Detecta automaticamente onde o Claude Desktop guarda o
  claude_desktop_config.json nesta máquina (instalação MSIX ou tradicional).
- Limpa instâncias órfãs de server.py deste projeto (processos presos de
  sessões anteriores, cujo processo pai já morreu).
- Lê o project_name do config.yaml e garante que ele esteja registrado no
  claude_desktop_config.json (com backup automático antes de qualquer edição).

IMPORTANTE: feche o Claude Desktop por completo (bandeja do sistema, não só
a janela) antes de rodar este script. Veja o README.md para detalhes.

Uso:
    uv run start.py
"""

import json
import os
import platform
import shutil
import sys
from datetime import datetime
from pathlib import Path

import yaml

HERE = Path(__file__).parent.resolve()

# --- Saída colorida (laranja) -----------------------------------------
ORANGE = "\033[38;5;208m"
RESET = "\033[0m"

if platform.system() == "Windows":
    os.system("")  # habilita sequências ANSI em terminais Windows mais antigos


def log(msg: str = "") -> None:
    """Imprime toda a saída do script em laranja."""
    print(f"{ORANGE}{msg}{RESET}")


# ------------------------------------------------------------------------


def load_project_config() -> dict:
    cfg_path = HERE / "config.yaml"
    if not cfg_path.exists():
        log(f"Erro: config.yaml não encontrado em {HERE}")
        sys.exit(1)
    return yaml.safe_load(cfg_path.read_text(encoding="utf-8"))


def get_claude_config_path() -> Path:
    """
    Detecta o claude_desktop_config.json desta máquina, cobrindo tanto a
    instalação MSIX (Microsoft Store) quanto a tradicional.

    Ordem de busca no Windows:
    1. MSIX: %LOCALAPPDATA%\\Packages\\Claude_*\\LocalCache\\Roaming\\Claude\\
    2. Tradicional: %APPDATA%\\Claude\\
    3. %LOCALAPPDATA%\\Claude\\

    Retorna o primeiro candidato existente com conteúdo; se nenhum existir,
    retorna o primeiro cuja pasta pai já existe (para permitir criação).
    """
    system = platform.system()

    if system == "Windows":
        local = Path(os.environ.get("LOCALAPPDATA", ""))
        roaming = Path(os.environ.get("APPDATA", ""))

        candidatos = []

        # Instalação MSIX (Microsoft Store)
        packages = local / "Packages"
        if packages.exists():
            for pasta in packages.iterdir():
                if pasta.name.startswith("Claude_") and pasta.is_dir():
                    candidatos.append(
                        pasta / "LocalCache" / "Roaming" / "Claude" / "claude_desktop_config.json"
                    )

        # Instalação tradicional
        candidatos.append(roaming / "Claude" / "claude_desktop_config.json")
        candidatos.append(local / "Claude" / "claude_desktop_config.json")

    elif system == "Darwin":
        candidatos = [
            Path.home() / "Library" / "Application Support" / "Claude" / "claude_desktop_config.json"
        ]
    else:
        candidatos = [Path.home() / ".config" / "Claude" / "claude_desktop_config.json"]

    for c in candidatos:
        if c.exists() and c.stat().st_size > 10:
            log(f"Config detectado (instalação existente): {c}")
            return c

    for c in candidatos:
        if c.parent.exists():
            log(f"Nenhum config existente encontrado — será criado em: {c}")
            return c

    # Último recurso: primeiro candidato, criando a pasta
    log(f"Nenhuma pasta de instalação encontrada — usando padrão: {candidatos[0]}")
    return candidatos[0]


def limpar_processos_zumbis() -> None:
    """
    Encerra instâncias órfãs de server.py DESTE projeto — ou seja, cujo
    processo pai original já morreu (ex: Claude Desktop fechado sem matar
    o subprocesso MCP filho).

    Critério de segurança: só mata processo cujo PPID não está mais vivo.
    Se o pai ainda existe (o próprio Claude Desktop rodando), nunca mexe.
    """
    try:
        import psutil
    except ImportError:
        log("psutil não encontrado — pulando checagem de processos órfãos.")
        log("(opcional: já está nas dependências do pyproject.toml — rode 'uv sync')")
        return

    server_marker = str((HERE / "server.py").resolve()).lower()

    candidatos = []
    for proc in psutil.process_iter(["pid", "name", "create_time", "cmdline"]):
        try:
            info = proc.info
            nome = (info.get("name") or "").lower()
            if "python" not in nome and "uv" not in nome:
                continue
            cmdline_str = " ".join(info.get("cmdline") or []).lower()
            if server_marker not in cmdline_str:
                continue
            candidatos.append(proc)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    if not candidatos:
        log("Nenhuma instância de server.py rodando (esperado com o Claude Desktop fechado).")
        return

    orfaos = []
    for p in candidatos:
        try:
            ppid = p.ppid()
            pai_vivo = ppid != 0 and psutil.pid_exists(ppid)
        except Exception:
            pai_vivo = False
            ppid = None

        inicio = datetime.fromtimestamp(p.info["create_time"]).strftime("%d/%m/%Y %H:%M:%S")
        if pai_vivo:
            log(f"PID {p.pid} (iniciado em {inicio}) — pai vivo (PID {ppid}) → não mexo")
        else:
            log(f"PID {p.pid} (iniciado em {inicio}) — pai morto (PPID {ppid}) → órfão real")
            orfaos.append(p)

    if not orfaos:
        log("Nenhum processo órfão de verdade — só instâncias com pai vivo.")
        return

    for p in orfaos:
        try:
            p.terminate()
            try:
                p.wait(timeout=3)
            except psutil.TimeoutExpired:
                p.kill()
            log(f"PID {p.pid} encerrado (órfão real).")
        except psutil.AccessDenied:
            log(f"PID {p.pid}: sem permissão para encerrar — feche manualmente.")
        except psutil.NoSuchProcess:
            log(f"PID {p.pid}: já havia encerrado sozinho.")
        except Exception as e:
            log(f"PID {p.pid}: falha ao encerrar — {e}")


def ensure_registration(project_name: str) -> bool:
    config_path = get_claude_config_path()
    config_path.parent.mkdir(parents=True, exist_ok=True)

    if config_path.exists():
        raw = config_path.read_text(encoding="utf-8").strip()
        data = json.loads(raw) if raw else {}
    else:
        data = {}

    data.setdefault("mcpServers", {})

    if project_name in data["mcpServers"]:
        log(f"'{project_name}' já está registrado em: {config_path}")
        return False

    if config_path.exists():
        backup_path = config_path.with_suffix(".json.bak")
        shutil.copy(config_path, backup_path)
        log(f"Backup criado em: {backup_path}")

    uv_path = shutil.which("uv") or "uv"
    if uv_path == "uv":
        log(
            "Aviso: não encontrei o caminho absoluto do 'uv' no PATH deste "
            "terminal. Usando apenas 'uv' — se o Claude Desktop não achar o "
            "comando, rode 'where uv' e use o caminho completo no registro."
        )

    data["mcpServers"][project_name] = {
        "command": uv_path,
        "args": ["run", "--directory", str(HERE), "server.py"],
    }

    config_path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    log(f"'{project_name}' registrado com sucesso em: {config_path}")

    verify = json.loads(config_path.read_text(encoding="utf-8"))
    keys = list(verify.get("mcpServers", {}).keys())
    log(f"Conferência pós-gravação — servidores no arquivo agora: {keys}")
    if project_name not in keys:
        log(
            "ALERTA: a entrada não aparece na releitura do arquivo. Não "
            "prossiga sem investigar (permissão de escrita, antivírus, ou "
            "outro processo reescrevendo o arquivo)."
        )

    return True


def main():
    cfg = load_project_config()
    project_name = cfg["project_name"]

    log(f"Projeto: {project_name}")
    log(f"Pasta do servidor: {HERE}")
    log()

    log("Verificando processos órfãos de server.py...")
    limpar_processos_zumbis()
    log()

    changed = ensure_registration(project_name)

    log()
    if changed:
        log("Reinicie o Claude Desktop para carregar o novo servidor MCP.")
    else:
        log("Nada a fazer. Reinicie o Claude Desktop apenas se editou algo manualmente.")


if __name__ == "__main__":
    main()
