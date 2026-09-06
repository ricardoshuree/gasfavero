"""
instalar.py — instala o Bloco de Vale Gas no projeto erp-gasfavero.
Execute na raiz do projeto: python instalar.py
"""
import os, shutil, pathlib

ROOT = pathlib.Path(__file__).parent.parent  # raiz do projeto
HERE = pathlib.Path(__file__).parent         # pasta com os arquivos gerados

def cp(src_name, dest_rel):
    src  = HERE / src_name
    dest = ROOT / dest_rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(src, dest)
    print(f"  copiado → {dest_rel}")

def patch(rel, old, new, encoding="utf-8-sig"):
    p = ROOT / rel
    t = p.read_text(encoding=encoding)
    if old in t:
        p.write_text(t.replace(old, new), encoding="utf-8")
        print(f"  patchado → {rel}")
    else:
        print(f"  JA OK ou nao encontrado → {rel}  (trecho: {old[:60]!r})")

print("\n=== Instalando Bloco de Vale Gas ===\n")

# 1. Migration
cp("r3s4t5u6v7w8_bloco_vale_gas.py",
   "backend/app/alembic/versions/r3s4t5u6v7w8_bloco_vale_gas.py")

# 2. Rota backend
cp("vale_gas.py", "backend/app/api/routes/vale_gas.py")

# 3. Frontend — componentes
cp("AddBlocoValeGas.tsx", "frontend/src/components/ValeGas/AddBlocoValeGas.tsx")
cp("columns_vale_gas.tsx", "frontend/src/components/ValeGas/columns.tsx")

# 4. Frontend — rota
cp("vale-gas.tsx", "frontend/src/routes/_layout/vale-gas.tsx")

# 5. Patch models.py — adiciona BlocoValeGas ao final
models_addition = """

# ---------------------------------------------------------------------------
# gasfavero — Bloco de Vale Gas
#
# Talao impresso por grafica, associado a um estabelecimento comercial (PJ).
# Um cliente so pode ter um bloco ativo (unique cliente_id -- decisao
# confirmada: se precisar de novo bloco, encerra o antigo primeiro).
# Numeracao propria, separada dos blocos de fiado dos motoristas.
# ---------------------------------------------------------------------------

class BlocoValeGas(SQLModel, table=True):
    __tablename__ = "bloco_vale_gas"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    # unique=True: um estabelecimento, um bloco ativo
    cliente_id: uuid.UUID = Field(foreign_key="cliente.id", ondelete="RESTRICT", unique=True)
    primeira_folha: int
    ultima_folha: int
    # data de circulacao -- quando o talao entrou em uso (informativo)
    data: date
    created_at: datetime = Field(
        default_factory=get_datetime_utc, sa_type=DateTime(timezone=True)
    )


class BlocoValeGasCreate(SQLModel):
    cliente_id: uuid.UUID
    primeira_folha: int = Field(gt=0)
    ultima_folha: int = Field(gt=0)
    data: date


class BlocoValeGasPublic(SQLModel):
    id: uuid.UUID
    cliente_id: uuid.UUID
    cliente_nome: str
    cliente_cpf: str
    primeira_folha: int
    ultima_folha: int
    total_folhas: int
    data: date
    created_at: datetime


class BlocosValeGasPublic(SQLModel):
    data: list[BlocoValeGasPublic]
"""
models_path = ROOT / "backend/app/models.py"
models_txt = models_path.read_text(encoding="utf-8-sig")
if "BlocoValeGas" not in models_txt:
    models_path.write_text(models_txt + models_addition, encoding="utf-8")
    print("  patchado → backend/app/models.py (BlocoValeGas adicionado)")
else:
    print("  JA OK → backend/app/models.py")

# 6. Patch api/main.py — registra o router
patch(
    "backend/app/api/main.py",
    "from app.api.routes import (\n    clientes,",
    "from app.api.routes import (\n    clientes,\n    vale_gas,"
)
patch(
    "backend/app/api/main.py",
    "api_router.include_router(fechamento.router)",
    "api_router.include_router(fechamento.router)\napi_router.include_router(vale_gas.router)"
)

# 7. Patch AppSidebar.tsx — adiciona item no menu
patch(
    "frontend/src/components/Sidebar/AppSidebar.tsx",
    '  { module: "vales", icon: Ticket, title: "Bloco de Fiados", path: "/vales" },',
    '  { module: "vales", icon: Ticket, title: "Bloco de Fiados", path: "/vales" },\n  { module: "vale_gas", icon: Flame, title: "Bloco de Vale Gás", path: "/vale-gas" },'
)
# Adiciona Flame ao import se nao existir
patch(
    "frontend/src/components/Sidebar/AppSidebar.tsx",
    "  Ticket,",
    "  Ticket,\n  Flame,"
)

print("\n=== Concluido! ===")
print("\nProximos passos:")
print("  1. cd frontend && npx @tanstack/router-cli generate && npm run build && cd ..")
print("  2. git add -A && git commit -m 'feat: bloco de vale gas' && git push")
print("  3. cd backend && railway run alembic upgrade head")
