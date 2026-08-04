# [mcp-local harness] feature: add-restart-subcommand | plano: 96bfa24f | 2026-08-04 01:15:08
# Adiciona subcomando restart que forca encerramento do server.py deste projeto mesmo com pai vivo
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
    uv run start.py            # registro normal (padrão, comportamento antigo)
    uv run start.py restart    # mata a instância ATUAL deste server.py, mesmo
                                # com o processo pai (Claude Desktop) vivo, e
                                # forca ele a subir de novo na proxima chamada
                                # -- usado para recarregar config.yaml (ex:
                                # allowed_extensions) sem fechar o app inteiro.
                                # ATENCAO: se uma sessao do Claude estiver
                                # usando este servidor agora, ela vai perder a
                                # conexao. Pode ser preciso reativar o
                                # conector manualmente (toggle off/on) depois.
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

# --- Saída colorida ------------------------------------------------------
# Cada cor tem um papel semântico fixo, não é decoração aleatória:
#   BLUE   (azul claro)  -> título/cabeçalho de seção: o que está acontecendo agora
#   WHITE  (branco)      -> detalhe informativo neutro: valores, caminhos, contagens
#   GREEN  (verde fósforo) -> confirmação positiva: "nada a fazer", "já registrado", "encerrado"
#   RED    (vermelho)    -> aviso/alerta real: algo que pede atenção do operador
#   ORANGE (laranja)     -> reservado só para a mensagem final de conclusão/próxima ação
WHITE = "\033[38;5;15m"
GREEN = "\033[38;5;46m"
BLUE = "\033[38;5;51m"
RED = "\033[38;5;196m"
ORANGE = "\033[38;5;208m"
RESET = "\033[0m"

if platform.system() == "Windows":
    os.system("")  # habilita sequências ANSI em terminais Windows mais antigos


def log_title(msg: str = "") -> None:
    """Cabeçalho de seção / ação que está começando agora."""
    print(f"{BLUE}{msg}{RESET}")


def log_info(msg: str = "") -> None:
    """Detalhe informativo neutro, sem juízo de sucesso ou falha."""
    print(f"{WHITE}{msg}{RESET}")


def log_success(msg: str = "") -> None:
    """Confirmação positiva: algo terminou bem ou não havia problema."""
    print(f"{GREEN}{msg}{RESET}")


def log_warn(msg: str = "") -> None:
    """Aviso ou alerta que merece atenção do operador."""
    print(f"{RED}{msg}{RESET}")


def log_final(msg: str = "") -> None:
    """Mensagem final de conclusão / próxima ação recomendada. Só usar 1x por execução."""
    print(f"{ORANGE}{msg}{RESET}")


def log_pair(label: str, value: str) -> None:
    """Imprime rótulo (azul, título) e valor (branco, detalhe) na mesma linha."""
    print(f"{BLUE}{label}{RESET} {WHITE}{value}{RESET}")


def blank() -> None:
    print()


# ------------------------------------------------------------------------


def load_project_config() -> dict:
    cfg_path = HERE / "config.yaml"
    if not cfg_path.exists():
        log_warn(f"Erro: config.yaml não encontrado em {HERE}")
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
            log_pair("Config detectado (instalação existente):", str(c))
            return c

    for c in candidatos:
        if c.parent.exists():
            log_pair("Nenhum config existente encontrado — será criado em:", str(c))
            return c

    # Último recurso: primeiro candidato, criando a pasta
    log_warn(f"Nenhuma pasta de instalação encontrada — usando padrão: {candidatos[0]}")
    return candidatos[0]


def _find_processos_deste_server() -> list:
    """
    Retorna todas as instâncias de server.py DESTE projeto atualmente
    rodando, vivas ou não -- sem filtrar por estado do pai. Usado tanto
    pela limpeza de órfãos quanto pelo restart forçado.
    """
    try:
        import psutil
    except ImportError:
        return []

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

    return candidatos


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
        log_warn("psutil não encontrado — pulando checagem de processos órfãos.")
        log_info("(opcional: já está nas dependências do pyproject.toml — rode 'uv sync')")
        return

    candidatos = _find_processos_deste_server()

    if not candidatos:
        log_success("Nenhuma instância de server.py rodando (esperado com o Claude Desktop fechado).")
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
            log_info(f"PID {p.pid} (iniciado em {inicio}) — pai vivo (PID {ppid}) → não mexo")
        else:
            log_warn(f"PID {p.pid} (iniciado em {inicio}) — pai morto (PPID {ppid}) → órfão real")
            orfaos.append(p)

    if not orfaos:
        log_success("Nenhum processo órfão de verdade — só instâncias com pai vivo.")
        return

    for p in orfaos:
        try:
            p.terminate()
            try:
                p.wait(timeout=3)
            except psutil.TimeoutExpired:
                p.kill()
            log_success(f"PID {p.pid} encerrado (órfão real).")
        except psutil.AccessDenied:
            log_warn(f"PID {p.pid}: sem permissão para encerrar — feche manualmente.")
        except psutil.NoSuchProcess:
            log_success(f"PID {p.pid}: já havia encerrado sozinho.")
        except Exception as e:
            log_warn(f"PID {p.pid}: falha ao encerrar — {e}")


def forcar_restart() -> None:
    """
    Mata QUALQUER instância de server.py deste projeto, mesmo com o
    processo pai (Claude Desktop) vivo -- diferente de
    limpar_processos_zumbis(), que só mexe em órfãos reais.

    Objetivo: forçar a próxima chamada de ferramenta a subir um processo
    novo, que relê config.yaml do zero (ex: allowed_extensions
    atualizado). Não relança o processo sozinho -- quem faz isso é o
    Claude Desktop, sob demanda, na próxima vez que precisar do servidor.

    ATENÇÃO: se uma sessão do Claude estiver com este servidor conectado
    agora, a chamada de ferramenta em andamento (ou a próxima) vai
    falhar com erro de conexão. Pode ser necessário reativar o conector
    manualmente (toggle off/on) na lista de conectores do Claude Desktop
    depois de rodar isto -- não há garantia de reconexão automática.
    """
    try:
        import psutil
    except ImportError:
        log_warn("psutil não encontrado — não consigo localizar o processo para matar.")
        log_info("Rode 'uv sync' primeiro (psutil já está no pyproject.toml).")
        return

    candidatos = _find_processos_deste_server()

    if not candidatos:
        log_success("Nenhuma instância de server.py rodando agora — nada para reiniciar.")
        return

    for p in candidatos:
        try:
            ppid = p.ppid()
            pai_vivo = ppid != 0 and psutil.pid_exists(ppid)
        except Exception:
            pai_vivo = False
            ppid = None

        inicio = datetime.fromtimestamp(p.info["create_time"]).strftime("%d/%m/%Y %H:%M:%S")
        estado_pai = f"pai vivo (PID {ppid})" if pai_vivo else f"pai morto (PPID {ppid})"
        log_warn(f"PID {p.pid} (iniciado em {inicio}) — {estado_pai} → encerrando à força")

        try:
            p.terminate()
            try:
                p.wait(timeout=3)
            except psutil.TimeoutExpired:
                p.kill()
            log_success(f"PID {p.pid} encerrado.")
        except psutil.AccessDenied:
            log_warn(f"PID {p.pid}: sem permissão para encerrar — feche manualmente.")
        except psutil.NoSuchProcess:
            log_success(f"PID {p.pid}: já havia encerrado sozinho.")
        except Exception as e:
            log_warn(f"PID {p.pid}: falha ao encerrar — {e}")


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
        log_success(f"'{project_name}' já está registrado em: {config_path}")
        return False

    if config_path.exists():
        backup_path = config_path.with_suffix(".json.bak")
        shutil.copy(config_path, backup_path)
        log_success(f"Backup criado em: {backup_path}")

    uv_path = shutil.which("uv") or "uv"
    if uv_path == "uv":
        log_warn(
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
    log_success(f"'{project_name}' registrado com sucesso em: {config_path}")

    verify = json.loads(config_path.read_text(encoding="utf-8"))
    keys = list(verify.get("mcpServers", {}).keys())
    log_pair("Conferência pós-gravação — servidores no arquivo agora:", str(keys))
    if project_name not in keys:
        log_warn(
            "ALERTA: a entrada não aparece na releitura do arquivo. Não "
            "prossiga sem investigar (permissão de escrita, antivírus, ou "
            "outro processo reescrevendo o arquivo)."
        )

    return True


def main():
    args = sys.argv[1:]
    modo_restart = len(args) > 0 and args[0] == "restart"

    cfg = load_project_config()
    project_name = cfg["project_name"]

    log_pair("Projeto:", project_name)
    log_pair("Pasta do servidor:", str(HERE))
    blank()

    if modo_restart:
        log_title("Forçando reinício do servidor MCP deste projeto...")
        forcar_restart()
        blank()
        log_final(
            "Processo encerrado. Se uma sessão do Claude estava conectada, "
            "reative o conector manualmente (toggle off/on) se ela não "
            "reconectar sozinha na próxima chamada de ferramenta."
        )
        return

    log_title("Verificando processos órfãos de server.py...")
    limpar_processos_zumbis()
    blank()

    changed = ensure_registration(project_name)

    blank()
    if changed:
        log_final("Reinicie o Claude Desktop para carregar o novo servidor MCP.")
    else:
        log_final("Nada a fazer. Reinicie o Claude Desktop apenas se editou algo manualmente.")


if __name__ == "__main__":
    main()
