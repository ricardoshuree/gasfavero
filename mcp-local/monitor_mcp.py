"""
monitor_mcp.py — erp-gasfavero MCP Monitor
Uso: python monitor_mcp.py  |  Encerrar: Ctrl+C

Painel 1: histograma de latencia de ping (psutil) do mcp-erp-gasfavero
Painel 2: ultimas operacoes registradas no mcp_audit.jsonl (propose/approve/write/read)

Detecta instancias duplicadas do server.py e exibe aviso ambar.
Refresh a cada 3s com limpeza de tela inteira (funciona no terminal integrado do VS Code).
"""
from __future__ import annotations
import sys, os, time, threading, re, json
from pathlib import Path
from datetime import datetime, timezone
from collections import deque

if sys.platform == "win32":
    try:
        import ctypes
        k = ctypes.windll.kernel32
        k.SetConsoleMode(k.GetStdHandle(-11), 7)
    except Exception:
        pass

ROOT = Path(__file__).parent  # mcp-local/
AUDIT_FILE = ROOT / "mcp_audit.jsonl"
SERVER_PY  = (ROOT / "server.py").resolve()

# Cores ANSI
_R   = "\033[0m"
_G   = "\x1b[38;5;82m"   # verde fosforescente — online / ok
_GN  = "\x1b[38;5;190m"  # verde claro — latencia normal
_RD  = "\x1b[38;5;160m"  # vermelho — offline / erro
_AM  = "\x1b[38;5;208m"  # ambar — aviso
_DIM = "\x1b[2m"
_BD  = "\x1b[1m"
_GR  = "\x1b[38;5;240m"  # cinza — detalhe inativo
_CY  = "\x1b[38;5;39m"   # ciano — nome de ferramenta
_BL  = "\x1b[38;5;75m"   # azul claro — label

_PING_INTERVAL = 3.0
_HIST_W  = 60
_LINE_W  = 90
_BLOCKS  = " \u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588"
_ANSI_RE = re.compile(r'\x1b\[[0-9;]*m')
_AUDIT_ROWS = 12  # quantas operacoes exibir no painel 2

# Cores por operacao
_OP_COLORS = {
    "propose_change":  _BL,
    "approve_change":  _G,
    "write_file":      _GN,
    "read_file":       _DIM,
    "list_dir":        _DIM,
    "reject_change":   _AM,
    "list_pending_changes": _GR,
}


def _vlen(s): return len(_ANSI_RE.sub("", s))
def _pad(s, w): return s + " " * max(0, w - _vlen(s))


# ── Status do MCP ─────────────────────────────────────────────────────────────
class MCPStatus:
    def __init__(self):
        self.alive       = False
        self.pid         = None
        self.lat_ms      = None
        self.uptime_start = None
        self.instancias  = 0
        self.history     = deque([None] * _HIST_W, maxlen=_HIST_W)
        self.lock        = threading.Lock()

    def record(self, lat):
        with self.lock:
            self.history.append(lat)
            if lat is not None:
                self.alive   = True
                self.lat_ms  = lat
                if self.uptime_start is None:
                    self.uptime_start = time.time()
            else:
                self.alive       = False
                self.lat_ms      = None
                self.uptime_start = None

    def lat_str(self):
        if self.lat_ms is None:
            return f"{_RD}offline{_R}"
        if self.lat_ms < 50:
            c = _G
        elif self.lat_ms < 200:
            c = _GN
        else:
            c = _AM
        return f"{c}{self.lat_ms:>5.0f} ms{_R}"

    def uptime_str(self):
        if self.uptime_start is None:
            return "—"
        s = int(time.time() - self.uptime_start)
        h, rem = divmod(s, 3600)
        m, sec = divmod(rem, 60)
        if h:
            return f"{h}h{m:02d}m"
        if m:
            return f"{m}m{sec:02d}s"
        return f"{sec}s"

    def pid_str(self):
        if self.pid is None:
            return "PID —"
        return f"PID {self.pid}"


# ── Ping ──────────────────────────────────────────────────────────────────────
def _ping_process(s: MCPStatus):
    """
    Verifica se o server.py do projeto esta rodando. Usa psutil para checar
    o processo por path de script — sem conexao de rede, so verificacao local.
    """
    try:
        import psutil
    except ImportError:
        return

    server_marker = str(SERVER_PY).lower()
    procs = []
    for proc in psutil.process_iter(["pid", "name", "cmdline", "create_time"]):
        try:
            info  = proc.info
            nome  = (info.get("name") or "").lower()
            if "python" not in nome and "uv" not in nome:
                continue
            cmd = " ".join(info.get("cmdline") or []).lower()
            if server_marker not in cmd:
                continue
            procs.append(proc)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    with s.lock:
        s.instancias = len(procs)
        if procs:
            p = procs[0]
            s.pid = p.pid
            # "latencia" simulada: tempo desde create_time (uptime do processo)
            # Usamos um ping real de existencia + tempo de resposta da chamada psutil
            t0 = time.perf_counter()
            _ = p.status()
            lat = (time.perf_counter() - t0) * 1000
            if s.uptime_start is None:
                s.uptime_start = p.info["create_time"]
            s.alive  = True
            s.lat_ms = lat
            s.history.append(lat)
        else:
            s.pid         = None
            s.alive       = False
            s.lat_ms      = None
            s.uptime_start = None
            s.history.append(None)


def _poll(s: MCPStatus):
    while True:
        _ping_process(s)
        time.sleep(_PING_INTERVAL)


# ── Histograma ────────────────────────────────────────────────────────────────
def _hist(history, width):
    vals = [v for v in history if v is not None]
    if not vals:
        return _GR + ("─" * width) + _R
    vmax = max(vals) or 1
    out  = []
    for v in list(history)[-width:]:
        if v is None:
            out.append(f"{_RD}─{_R}")
        else:
            idx = max(1, int((v / vmax) * (len(_BLOCKS) - 1)))
            if v < 50:
                c = _G
            elif v < 200:
                c = _GN
            else:
                c = _AM
            out.append(f"{c}{_BLOCKS[idx]}{_R}")
    return "".join(out)


# ── Painel 1 — MCP status ─────────────────────────────────────────────────────
def _mcp_block(s: MCPStatus):
    dot = f"{_G}\u25cf{_R}" if s.alive else f"{_RD}\u25cf{_R}"
    lc  = _G if s.alive else _RD
    h   = _hist(s.history, _HIST_W)
    dup = f"  {_AM}\u26a0 {s.instancias} instancias{_R}" if s.instancias > 1 else ""

    l1 = f"  {dot} {_BD}mcp-erp-gasfavero{_R}  {h}{dup}"
    l2 = (
        f"       {_DIM}{'─'*17}{_R}  "
        f"{lc}{s.lat_str():>8}{_R}  "
        f"{_DIM}\u2191 {s.uptime_str():<10}{_R}  "
        f"{_GR}{s.pid_str()}{_R}"
    )
    return [l1, l2]


def _legend_ping():
    return [
        f"  {_DIM}ping: cada bloco = {_PING_INTERVAL:.0f}s  "
        f"{_G}\u2587{_R}{_DIM}=rapido(<50ms)  "
        f"{_GN}\u2587{_R}{_DIM}=normal(<200ms)  "
        f"{_AM}\u2587{_R}{_DIM}=alto  "
        f"{_RD}─{_R}{_DIM}=offline{_R}",
        f"  {_AM}\u26a0 N instancias{_R}{_DIM} = multiplos processos server.py rodando "
        f"(risco de lock — reinicie o MCP){_R}",
    ]


# ── Painel 2 — audit log ──────────────────────────────────────────────────────
def _read_audit(n=_AUDIT_ROWS):
    """Le as ultimas N entradas do mcp_audit.jsonl."""
    if not AUDIT_FILE.exists():
        return []
    try:
        linhas = AUDIT_FILE.read_text(encoding="utf-8").splitlines()
        linhas = [l for l in linhas if l.strip()]
        entries = []
        for l in linhas[-n:]:
            try:
                entries.append(json.loads(l))
            except Exception:
                pass
        return entries
    except Exception:
        return []


def _fmt_audit_ts(ts_str):
    """Formata timestamp ISO ou string simples para HH:MM:SS."""
    try:
        # Tenta ISO 8601
        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        return dt.strftime("%H:%M:%S")
    except Exception:
        # Fallback: pega so os ultimos 8 chars se parecer "2026-09-05 19:45:16"
        return ts_str[-8:] if len(ts_str) >= 8 else ts_str


def _render_audit(entries):
    if not entries:
        return [f"  {_DIM}(nenhuma operacao registrada ainda){_R}"]

    lines = []
    for e in reversed(entries):
        op      = e.get("action") or e.get("operation") or e.get("tool") or "?"
        ts      = _fmt_audit_ts(str(e.get("timestamp") or e.get("ts") or e.get("created_at") or ""))
        plan    = e.get("plan_id") or ""
        feature = e.get("feature") or ""
        path    = e.get("path") or e.get("rel_path") or e.get("file") or ""
        status  = e.get("status") or ""

        op_color = _OP_COLORS.get(op, _CY)
        ok_mark  = f"{_G}\u2713{_R}" if status in ("ok", "approved", "written", "") else f"{_AM}\u26a0{_R}"

        # Linha principal: timestamp + operacao
        l1 = f"  {_DIM}{ts}{_R}  {ok_mark}  {op_color}{op:<22}{_R}"
        if feature:
            l1 += f"  {_BL}{feature}{_R}"
        if plan:
            l1 += f"  {_GR}#{plan[:8]}{_R}"
        lines.append(l1)

        # Linha de detalhe: path (quando tem)
        if path:
            short = path[-60:] if len(path) > 60 else path
            lines.append(f"         {_DIM}{short}{_R}")

    return lines


def _legend_audit():
    db_ok = AUDIT_FILE.exists()
    if db_ok:
        st = f"{_G}ativo ({AUDIT_FILE.name}){_R}"
    else:
        st = f"{_AM}aguardando operacoes (mcp_audit.jsonl nao criado ainda){_R}"
    return f"  {_DIM}audit: {_R}{st}"


# ── Header / sep ──────────────────────────────────────────────────────────────
def _sep(c="─"):
    return f"  {_GR}{c * (_LINE_W - 4)}{_R}"


def _header():
    now = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    titulo = f"{_BD}erp-gasfavero MCP Monitor{_R}"
    return f"  {titulo}  {_DIM}{now}{_R}"


# ── Build frame ───────────────────────────────────────────────────────────────
def _build(s: MCPStatus):
    audit_entries = _read_audit()
    audit_lines   = _render_audit(audit_entries)

    lines = []
    lines.append(_sep("═"))
    lines.append(_header())
    lines.append(_sep())

    # Painel 1 — ping
    lines += _mcp_block(s)
    lines.append("")
    lines += _legend_ping()
    lines.append(_sep())

    # Painel 2 — audit
    n_shown = len(audit_entries)
    h2 = f"  {_BD}OPERACOES RECENTES{_R}"
    if n_shown:
        h2 += f"  {_DIM}ultimas {n_shown}{_R}"
    lines.append(h2)
    lines.append(_sep("·"))
    lines += audit_lines
    lines.append(_legend_audit())
    lines.append(_sep("═"))
    return lines


# ── Render loop ───────────────────────────────────────────────────────────────
def _render_loop(s: MCPStatus):
    while True:
        panel = _build(s)
        os.system("cls" if sys.platform == "win32" else "clear")
        sys.stdout.write("\n".join(panel) + "\n")
        sys.stdout.flush()
        time.sleep(_PING_INTERVAL)


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    try:
        import psutil  # noqa: F401
    except ImportError:
        print(f"\x1b[38;5;196m[ERRO]\033[0m psutil nao instalado.")
        print("Execute: uv sync (na pasta do projeto erp-gasfavero)")
        sys.exit(1)

    sys.stdout.write("\033]0;monitor_mcp — erp-gasfavero\007")
    sys.stdout.flush()
    os.system("cls" if sys.platform == "win32" else "clear")

    s = MCPStatus()
    threading.Thread(target=_poll, args=(s,), daemon=True).start()

    print(f"\n  \x1b[38;5;82merp-gasfavero MCP Monitor\033[0m — aguardando primeiro ping...")
    if not AUDIT_FILE.exists():
        print(f"  \x1b[38;5;208m[info]\033[0m mcp_audit.jsonl nao encontrado ainda")
    print()
    time.sleep(_PING_INTERVAL + 0.5)
    os.system("cls" if sys.platform == "win32" else "clear")

    try:
        _render_loop(s)
    except KeyboardInterrupt:
        print(f"\n  \x1b[2mMonitor encerrado.\033[0m\n")


if __name__ == "__main__":
    main()
