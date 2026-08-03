import yaml
from pathlib import Path
from fastmcp import FastMCP

import change_control as cc

cfg = yaml.safe_load(Path(__file__).parent.joinpath("config.yaml").read_text())
ROOT = Path(cfg["root_path"]).resolve()
ALLOWED_EXT = set(cfg.get("allowed_extensions", []))
BLOCKED = set(cfg.get("blocked_dirs", []))

# Raiz do PRÓPRIO mcp-local-erp (esta pasta), usada só para o bookkeeping do
# harness (mcp_state.json / mcp_audit.jsonl). Propositalmente diferente de
# ROOT: ROOT é o projeto que o servidor lê/escreve (ex: erp-distribuidora/),
# HARNESS_ROOT é onde o harness guarda seu próprio estado e log de auditoria.
# Sem essa separação, o estado do harness vazaria para dentro do projeto do
# cliente sempre que root_path apontasse para fora desta pasta.
HARNESS_ROOT = Path(__file__).parent.resolve()

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
def list_dir(rel_path: str = ".") -> list[str]:
    """Lista arquivos e pastas dentro do projeto."""
    p = _safe_path(rel_path)
    return [str(f.relative_to(ROOT)) for f in p.iterdir()]


# ---------------------------------------------------------------------------
# Harness de controle de mudanças
#
# write_file agora exige um plan_id previamente aprovado. O fluxo esperado:
#
#   1. propose_change(feature, description, files)  -> devolve plan_id "pending"
#   2. (o usuário aprova explicitamente na conversa)
#   3. approve_change(plan_id)                       -> plan_id vira "approved"
#   4. write_file(rel_path, content, plan_id, ...)    -> só executa se rel_path
#      estiver no escopo do plano aprovado; o conteúdo salvo recebe um
#      comentário de rastreabilidade injetado automaticamente.
# ---------------------------------------------------------------------------

@mcp.tool
def propose_change(feature: str, description: str, files: list[str]) -> dict:
    """
    Primeiro passo, obrigatório antes de qualquer write_file.
    Declare a feature/alteração, uma descrição objetiva do propósito, e a
    lista de paths (relativos à raiz do projeto) que serão criados ou
    modificados. Retorna um plano pendente de aprovação do usuário.
    """
    return cc.propose_change(HARNESS_ROOT, feature, description, files)


@mcp.tool
def approve_change(plan_id: str) -> dict:
    """Aprova um plano previamente proposto, liberando write_file para os
    arquivos declarados nele. Só chame isso depois de aprovação explícita
    do usuário na conversa."""
    return cc.approve_change(HARNESS_ROOT, plan_id)


@mcp.tool
def reject_change(plan_id: str) -> dict:
    """Rejeita/cancela um plano pendente."""
    return cc.reject_change(HARNESS_ROOT, plan_id)


@mcp.tool
def list_pending_changes(status: str = "pending") -> list[dict]:
    """Lista planos por status: 'pending', 'approved' ou 'rejected'."""
    return cc.list_plans(HARNESS_ROOT, status)


@mcp.tool
def write_file(rel_path: str, content: str, plan_id: str, feature: str, description: str) -> str:
    """
    Escreve/sobrescreve um arquivo do projeto.
    Requer um plan_id já aprovado (via propose_change + approve_change) cujo
    escopo inclua rel_path. O conteúdo salvo recebe automaticamente um
    comentário de rastreabilidade no topo (feature, plano, data/hora).
    """
    cc.check_authorized(HARNESS_ROOT, plan_id, rel_path)
    p = _safe_path(rel_path)
    if p.suffix and p.suffix not in ALLOWED_EXT:
        raise ValueError(f"Extensão não permitida: {p.suffix}")
    final_content = cc.inject_comment(rel_path, content, feature, description, plan_id)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(final_content, encoding="utf-8")
    cc.register_write(HARNESS_ROOT, plan_id, rel_path)
    return f"Arquivo salvo: {rel_path} (plano {plan_id})"


if __name__ == "__main__":
    mcp.run()
