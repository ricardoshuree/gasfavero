"""
monitor_mcp.py — erp-gasfavero MCP Monitor
Raiz: C:/project-claude/erp-gasfavero/
Uso: python monitor_mcp.py  |  Encerrar: Ctrl+C

Painel 1: histograma de latencia de ping (psutil) do mcp-erp-gasfavero
Painel 2: ultimas 12 tool calls com duracao real (SQLite mcp-local/monitor/tool_calls.db)
"""
from __future__ import annotations
import sys, os, time, threading, re, sqlite3
from pathlib import Path
from datetime import datetime
from collections import deque

if sys.platform == "win32":
    try:
        import ctypes
        k = ctypes.windll.kernel32
        k.SetConsoleMode(k.GetStdHandle(-11), 7)
    except Exception:
        pass

ROOT       = Path(__file__).parent.resolve()
SERVER_PY  = (ROOT / "mcp-local" / "server.py").resolve()
_TELEM_DB  = ROOT / "mcp-local" / "monitor" / "tool_calls.db"
_TELEM_ROWS = 12

# ── Cores ──────────────────────────────────────────────────────────────────────
_R   = "\033[0m"
_G   = "\x1b[38;5;82m"
_GN  = "\x1b[38;5;190m"
_RD  = "\x1b[38;5;160m"
_AM  = "\x1b[38;5;208m"
_DIM = "\x1b[2m"
_BD  = "\x1b[1m"
_GR  = "\x1b[38;5;240m"
_CY  = "\x1b[38;5;39m"

_PING_INTERVAL = 3.0
_HIST_W  = 60
_LINE_W  = 96
_BLOCKS  = " \u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588"
_ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")

def _vlen(s): return len(_ANSI_RE.sub("", s))
def _pad(s, w): return s + " " * max(0, w - _vlen(s))


# ── Status ─────────────────────────────────────────────────────────────────────
class MCPStatus:
    def __init__(self):
        self.alive        = False
        self.pid          = None
        self.lat_ms       = None
        self.uptime_start = None
        self.instancias   = 0
        self.history      = deque([None] * _HIST_W, maxlen=_HIST_W)
        self.lock         = threading.Lock()

    def record(self, lat):
        with self.lock:
            if lat is None:
                self.alive = False; self.lat_ms = None; self.uptime_start = None
            else:
                self.alive = True; self.lat_ms = lat
                if self.uptime_start is None:
                    self.uptime_start = datetime.now()
            self.history.append(lat)

    def uptime_str(self):
        if not self.alive or not self.uptime_start: return "offline"
        d = datetime.now() - self.uptime_start
        h, r = divmod(int(d.total_seconds()), 3600)
        m, s = divmod(r, 60)
        return f"{h}h {m:02d}m" if h else (f"{m}m {s:02d}s" if m else f"{s}s")

    def lat_str(self):
        if self.lat_ms is None: return "timeout"
        return f"{self.lat_ms:.0f} ms"

    def pid_str(self):
        return f"pid:{self.pid}" if self.pid else "offline"


# ── Deteccao de processo ───────────────────────────────────────────────────────
def _find_proc():
    """
    Varre processos Python cujo cmdline contem o path do server.py do MCP.
    Retorna (pid_principal, n_instancias).
    Detecta duplicatas e reporta via n_instancias > 1.
    """
    try:
        import psutil
    except ImportError:
        return None, 0
    alvo = str(SERVER_PY).lower()
    encontrados = []
    for p in psutil.process_iter(["pid", "name", "cmdline"]):
        try:
            if "python" not in (p.info["name"] or "").lower() and \
               "uv"     not in (p.info["name"] or "").lower():
                continue
            cmd = " ".join(p.info["cmdline"] or []).lower()
            if alvo in cmd:
                encontrados.append(p.info["pid"])
        except Exception:
            continue
    if not encontrados:
        return None, 0
    return encontrados[0], len(encontrados)


def _ping(pid):
    try:
        import psutil
        t = time.perf_counter()
        p = psutil.Process(pid)
        st = p.status()
        ms = (time.perf_counter() - t) * 1000
        if st in (psutil.STATUS_ZOMBIE, psutil.STATUS_DEAD):
            return None
        return round(max(1.0, ms + p.cpu_percent(interval=None) * 0.1), 1)
    except Exception:
        return None


def _poll(s: MCPStatus):
    while True:
        pid, n = _find_proc()
        s.pid = pid
        s.instancias = n
        s.record(_ping(pid) if pid else None)
        time.sleep(_PING_INTERVAL)


# ── Histograma ─────────────────────────────────────────────────────────────────
def _hist(history, width):
    items = list(history)[-width:]
    valid = [v for v in items if v is not None]
    mx  = max(valid) if valid else 1.0
    mn  = min(valid) if valid else 0.0
    rng = max(mx - mn, 1.0)
    out = []
    for v in items:
        if v is None:
            out.append(f"{_RD}\u2500{_R}")
        else:
            norm = (v - mn) / rng
            idx  = max(1, min(8, int(norm * 7) + 1))
            col  = _G if norm < 0.4 else (_GN if norm < 0.7 else _AM)
            out.append(f"{col}{_BLOCKS[idx]}{_R}")
    return "".join(out)


# ── Telemetria SQLite ──────────────────────────────────────────────────────────
def _read_telem(n=_TELEM_ROWS):
    if not _TELEM_DB.exists():
        return []
    try:
        con = sqlite3.connect(str(_TELEM_DB), timeout=1)
        cur = con.execute(
            "SELECT ts, tool, dur_ms, ok FROM tool_calls ORDER BY id DESC LIMIT ?", (n,)
        )
        rows = cur.fetchall()
        con.close()
        return [{"ts": r[0], "tool": r[1], "dur_ms": r[2], "ok": r[3]} for r in rows]
    except Exception:
        return []


def _bar_dur(dur_ms, max_ms, width=22):
    ratio  = min(1.0, dur_ms / max(max_ms, 1.0))
    filled = max(1, int(ratio * width))
    empty  = width - filled
    col = _G if ratio < 0.4 else (_GN if ratio < 0.7 else _AM)
    return f"{col}{'█' * filled}{_GR}{'░' * empty}{_R}"


def _render_telem(rows):
    if not rows:
        return [f"  {_DIM}aguardando primeira tool call...{_R}"]
    max_ms   = max(r["dur_ms"] for r in rows)
    max_tool = max(len(r["tool"]) for r in rows)
    lines = []
    for r in rows:
        ts_str  = datetime.fromtimestamp(r["ts"]).strftime("%H:%M:%S")
        tool    = r["tool"].ljust(max_tool)
        dur_str = f"{r['dur_ms']:>7.1f} ms"
        bar     = _bar_dur(r["dur_ms"], max_ms)
        ok_sym  = f"{_G}\u2713{_R}" if r["ok"] else f"{_RD}\u2717{_R}"
        tc      = _CY if r["ok"] else _RD
        lines.append(
            f"  {ok_sym}  {_DIM}{ts_str}{_R}  "
            f"{tc}{tool}{_R}  "
            f"{_AM}{dur_str}{_R}  {bar}"
        )
    return lines


# ── Render ─────────────────────────────────────────────────────────────────────
def _sep(c="\u2500"):
    return f"{_DIM}{c * _LINE_W}{_R}"

def _header():
    ts  = datetime.now().strftime("%H:%M:%S")
    tit = "  erp-gasfavero \u2014 MCP Monitor"
    pad = max(2, _LINE_W - len(tit) - len(ts) - 2)
    return f"{_BD}{tit}{_R}{' ' * pad}{_DIM}{ts}{_R}"

def _mcp_block(s: MCPStatus):
    dot = f"{_G}\u25cf{_R}" if s.alive else f"{_RD}\u25cf{_R}"
    lc  = _G if s.alive else _RD
    h   = _hist(s.history, _HIST_W)
    dup = f"  {_AM}\u26a0 {s.instancias} instancias{_R}" if s.instancias > 1 else ""
    l1  = f"  {dot} {_BD}{'MCP-GASFAVERO':<13}{_R} {h}{dup}"
    l2  = (
        f"       {_DIM}{'\u2500' * 13}{_R}  "
        f"{lc}{s.lat_str():>8}{_R}  "
        f"{_DIM}\u2191 {s.uptime_str():<10}{_R}  "
        f"{_GR}{s.pid_str()}{_R}"
    )
    return [l1, l2]

def _legend_ping():
    l1 = (
        f"  {_DIM}ping: cada bloco = {_PING_INTERVAL:.0f}s  "
        f"{_G}\u2587{_R}{_DIM}=rapido  "
        f"{_GN}\u2587{_R}{_DIM}=normal  "
        f"{_AM}\u2587{_R}{_DIM}=alto  "
        f"{_RD}\u2500{_R}{_DIM}=offline{_R}"
    )
    l2 = (
        f"  {_AM}\u26a0 N instancias{_R}{_DIM} = multiplos processos server.py "
        f"rodando simultaneamente (reinicie o MCP){_R}"
    )
    return [l1, l2]

def _legend_telem():
    db_ok = _TELEM_DB.exists()
    st = f"{_G}ativo{_R}" if db_ok else f"{_AM}aguardando server.py instrumentado{_R}"
    return (
        f"  {_DIM}tool calls: banco {_R}{st}"
        f"{_DIM}  \u00b7  {_CY}\u2713{_R}{_DIM}=ok  {_RD}\u2717{_R}{_DIM}=erro  barra=duracao relativa{_R}"
    )

def _build(s: MCPStatus):
    telem = _read_telem()
    tlines = _render_telem(telem)
    n_shown = len(telem)

    lines = []
    lines.append(_sep("\u2550"))
    lines.append(_header())
    lines.append(_sep())
    lines += _mcp_block(s)
    lines.append("")
    lines += _legend_ping()
    lines.append(_sep())
    h2 = f"  {_BD}TOOL CALLS{_R}"
    if n_shown:
        h2 += f"  {_DIM}ultimas {n_shown}{_R}"
    lines.append(h2)
    lines.append(_sep("\u00b7"))
    lines += tlines
    lines.append(_legend_telem())
    lines.append(_sep("\u2550"))
    return lines


def _render_loop(s: MCPStatus):
    while True:
        panel = _build(s)
        os.system("cls" if sys.platform == "win32" else "clear")
        sys.stdout.write("\n".join(panel) + "\n")
        sys.stdout.flush()
        time.sleep(_PING_INTERVAL)


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    try:
        import psutil  # noqa
    except ImportError:
        print(f"{_RD}[ERRO]{_R} psutil nao instalado.")
        print("Execute na raiz: python start.py")
        sys.exit(1)

    sys.stdout.write("\033]0;monitor_mcp — erp-gasfavero\007")
    sys.stdout.flush()
    os.system("cls" if sys.platform == "win32" else "clear")

    s = MCPStatus()
    threading.Thread(target=_poll, args=(s,), daemon=True).start()

    print(f"\n  {_G}erp-gasfavero MCP Monitor{_R} — aguardando primeiro ping...")
    if not _TELEM_DB.exists():
        print(f"  {_AM}[info]{_R} tool_calls.db nao encontrado — use o MCP para gerar dados")
    print()
    time.sleep(_PING_INTERVAL + 0.5)
    os.system("cls" if sys.platform == "win32" else "clear")

    try:
        _render_loop(s)
    except KeyboardInterrupt:
        print(f"\n  {_DIM}Monitor encerrado.{_R}\n")


if __name__ == "__main__":
    main()