import yaml
from pathlib import Path
from fastmcp import FastMCP

cfg = yaml.safe_load(Path(__file__).parent.joinpath("config.yaml").read_text())
ROOT = Path(cfg["root_path"]).resolve()
ALLOWED_EXT = set(cfg.get("allowed_extensions", []))
BLOCKED = set(cfg.get("blocked_dirs", []))

mcp = FastMCP(cfg["project_name"])  # <- nome que aparece no Claude Desktop

def _safe_path(rel_path: str) -> Path:
    p = (ROOT / rel_path).resolve()
    if not str(p).startswith(str(ROOT)):
        raise ValueError("Caminho fora do escopo do projeto")
    if any(b in p.parts for b in BLOCKED):
        raise ValueError("Diretório bloqueado")
    return p

@mcp.tool
def read_file(rel_path: str) -> str:
    """Lê o conteúdo de um arquivo do projeto."""
    p = _safe_path(rel_path)
    return p.read_text(encoding="utf-8")

@mcp.tool
def write_file(rel_path: str, content: str) -> str:
    """Escreve/sobrescreve um arquivo do projeto."""
    p = _safe_path(rel_path)
    if p.suffix and p.suffix not in ALLOWED_EXT:
        raise ValueError(f"Extensão não permitida: {p.suffix}")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
    return f"Arquivo salvo: {rel_path}"

@mcp.tool
def list_dir(rel_path: str = ".") -> list[str]:
    """Lista arquivos e pastas dentro do projeto."""
    p = _safe_path(rel_path)
    return [str(f.relative_to(ROOT)) for f in p.iterdir()]

if __name__ == "__main__":
    mcp.run()