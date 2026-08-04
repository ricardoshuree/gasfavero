<!--
[mcp-local harness] feature: docs-dockerfile-warning | plano: dcfb9694 | 2026-08-03 23:18:32
Documenta o problema do Dockerfile monorepo e a correção de forçar Railpack no Railway
-->
# gasfavero

ERP do GAS Favero (controle de vendas). Instância isolada derivada do
[`erp-core-template`](https://github.com/ricardoshuree/erp-core-template),
com o [`mcp-local`](https://github.com/ricardoshuree/mcp-local) embarcado
como subtree em `mcp-local/` — monólito autocontido, sem dependência de
outros projetos ativos.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Python 3.12, FastAPI, SQLModel, Alembic, Argon2 |
| Frontend | React, TypeScript, Tailwind CSS, shadcn/ui, TanStack Router |
| Banco | PostgreSQL via Supabase (produção) / SQLite in-memory (testes) |
| Auth | Supabase Auth (Email + Google OAuth) |
| Deploy | Vercel (frontend) + Railway (backend) |
| CI/CD | GitHub Actions |
| Dev | uv, mcp-local (embarcado, servidor MCP isolado deste projeto) |

---

## Estrutura

```
erp-gasfavero/
├── backend/
│   ├── app/
│   │   ├── alembic/versions/   ← migrations de banco (inclui RBAC)
│   │   ├── api/routes/         ← endpoints FastAPI
│   │   ├── core/               ← config, db, security
│   │   └── models.py           ← todos os modelos SQLModel
│   ├── Dockerfile              ← NÃO usar no Railway (ver seção de infra)
│   └── tests/
│       └── rbac/               ← testes de RBAC (SQLite, sem Docker)
├── frontend/
│   └── src/
│       ├── components/Sidebar/ ← menu lateral dinâmico por role
│       ├── hooks/
│       │   ├── useAuth.ts      ← autenticação
│       │   └── usePermissions.ts ← permissões por módulo
│       └── routes/             ← páginas do app
├── .github/workflows/
│   └── test-rbac.yml           ← CI: roda testes RBAC a cada push/PR
├── .env.example                ← variáveis necessárias (sem valores reais)
├── activate.ps1                ← ativa venv do backend no Windows/VS Code
└── mcp-local/                  ← servidor MCP deste projeto (versionado, subtree)
    └── config.yaml             ← project_name: mcp-erp-gasfavero
```

---

## Módulo de segurança — RBAC

O controle de acesso é baseado em quatro tabelas:

```
Role           → papel do usuário ("admin", "editor", "viewer")
Module         → módulo do sistema ("clientes", "financeiro", "estoque"...)
RolePermission → matriz role × módulo com can_read e can_edit
UserRole       → associação usuário × role
```

Roles e módulos padrão criados automaticamente na primeira inicialização:
- **Roles**: `admin` (leitura + edição), `editor` (leitura + edição), `viewer` (somente leitura)
- **Módulos**: `usuarios`, `configuracoes`

O menu lateral do frontend é renderizado dinamicamente com base nas
permissões do usuário logado. Para adicionar um novo módulo específico
do negócio (ex: `vendas`, `estoque-gas`):
1. Crie a migration Alembic inserindo o módulo na tabela `module`
2. Adicione a entrada em `frontend/src/components/Sidebar/AppSidebar.tsx`
   no array `MODULE_ITEMS` com o mesmo nome de módulo

---

## Como rodar localmente

### Pré-requisitos

- Python 3.12+ — `winget install Python.Python.3.12` (Windows)
- uv — `powershell -c "irm https://astral.sh/uv/install.ps1 | iex"` (Windows)
- Node.js 20+ — https://nodejs.org

### Backend

```powershell
cp .env.example .env
# Edite .env com os valores do Supabase (ver seção de infra abaixo)

uv sync
. .\activate.ps1

cd backend
uv run alembic upgrade head        # aplica as migrations (inclui RBAC)
uv run python -m app.initial_data  # cria superuser e seed de roles/módulos
uv run uvicorn app.main:app --reload --port 8000
```

API: http://localhost:8000 — Docs: http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install   # ou: bun install
npm run dev   # ou: bun dev
```

App: http://localhost:5173

### Testes

```powershell
cd backend
pytest tests/rbac/ -v   # roda sem banco externo (SQLite in-memory)
```

---

## Setup de infraestrutura — Supabase + Google OAuth + Railway

Checklist do processo de provisionamento deste ERP. Atualizado conforme
os passos são concluídos.

### Decisões tomadas

- **Plano Supabase**: Free tier por enquanto (projeto ainda em setup, sem
  uso real). Gatilho de upgrade para Pro ($25/mês/organização): **antes
  de ir para produção com o cliente**, ou quando o 3º ERP precisar de
  slot — o que vier primeiro. Free permite só 2 projetos ativos por
  organização e pausa projetos após 7 dias sem requisições — inaceitável
  em produção, mas adequado para desenvolvimento.
- **Alocação dos 2 slots free**: `gasfavero` e `dragrafavero` (sujeito a
  mudança). A confecção fica no slot pago desde o início.
- **Ambiente**: só produção por enquanto, sem projeto Supabase de dev
  separado (decisão para caber no free tier com múltiplos ERPs).
- **Segurança na criação do projeto Supabase**: `Enable automatic RLS`
  ativado (toda tabela nova nasce fechada por padrão, sem policy
  explícita ninguém acessa via API) e `Automatically expose new tables`
  desativado (backend acessa o Postgres diretamente via SQLModel/Alembic,
  não pela API REST autogerada — não há necessidade de expor tabelas
  por esse caminho).
- **Conexão Postgres**: via **Session pooler** (porta 5432, host
  `aws-0-sa-east-1.pooler.supabase.com`), não Transaction pooler nem
  conexão direta — o Railway mantém o processo `uvicorn` rodando de
  forma persistente (não é serverless/stateless), então o Session
  pooler preserva o comportamento completo de sessão que o SQLModel
  precisa, só proxeando via IPv4.
- **Google OAuth consent screen**: criado em modo **Testing** (não
  verificado publicamente) — suficiente para uso interno do ERP.
  Antes de testar o login de fato, é preciso adicionar os e-mails que
  vão logar em **Google Auth Platform → Audience → Test users**,
  senão o Google recusa o login mesmo com client ID/secret corretos.
- **Rotação de credenciais**: durante o setup, a senha do Postgres, a
  `service_role` key do Supabase e o Client Secret do Google OAuth
  passaram em texto puro pelo chat de configuração. Todas foram
  rotacionadas após o uso (senha resetada, secret key regenerada,
  OAuth client secret regenerado com o antigo excluído). Lição para os
  próximos ERPs: preferir descrever "copiei o valor" a colar o valor
  em si na conversa, mesmo com um assistente — evita rotação reativa.
- **Bug de percent-encoding na senha do Postgres**: o `config.py`
  herdado do `erp-core-template` monta a URI de conexão concatenando
  `POSTGRES_USER:POSTGRES_PASSWORD@POSTGRES_SERVER` sem escapar
  caracteres especiais. Uma senha gerada com símbolos como `@`, `#`,
  `!`, `&` quebra o parser da URI (o SQLAlchemy interpreta parte da
  senha como se fosse o host). Contorno usado: senha do banco gerada
  só com caracteres alfanuméricos. **Dívida técnica**: corrigir
  `backend/app/core/config.py` para aplicar `urllib.parse.quote_plus`
  na senha antes de montar a URI, evitando essa armadilha nos próximos
  ERPs independente de como a senha for gerada.
- **`backend/Dockerfile` não deve ser usado no Railway**: esse arquivo
  veio do `fastapi/full-stack-fastapi-template` original e builda
  **frontend e backend juntos numa única imagem** (estágio Bun compila
  o React, copia pro estágio Python, serve tudo de um container só) —
  o contexto de build esperado é a raiz do repositório, não `backend/`.
  Isso contraria a arquitetura decidida (Vercel para frontend, Railway
  só para backend, deploys independentes). O Railway detecta esse
  Dockerfile automaticamente e tenta usá-lo em vez do Railpack, o que
  quebra o build. **Correção**: em Railway → Settings → Build →
  Builder, forçar manualmente `Railpack` em vez de `Dockerfile`. O
  arquivo em si foi mantido no repo (não removido) por poder ser útil
  no futuro caso o projeto migre para deploy single-container via
  Docker Compose — mas hoje é um artefato órfão em relação ao deploy
  real usado.

### Checklist

- [x] 1. Criar projeto no Supabase (Postgres + Auth)
- [x] 2. Coletar `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [x] 3. Criar OAuth 2.0 Client ID no Google Cloud Console
- [x] 4. Configurar redirect URI e ativar provider Google no Supabase Auth
- [x] 5. Preencher `.env` local com as credenciais
- [x] 6. Aplicar migrations (incluindo RBAC) no Postgres do Supabase
- [ ] 7. Criar projeto no Railway e conectar ao repositório GitHub
- [ ] 8. Configurar variáveis de ambiente no Railway
- [ ] 9. Validar deploy do backend em produção

### 1. Criar projeto no Supabase

1. Acesse https://supabase.com/dashboard e crie/entre na conta
2. Novo projeto → nome `gasfavero`, região mais próxima do Brasil
   (`South America (São Paulo)`), plano Free
3. Gere e guarde a senha do banco em local seguro — **prefira só
   caracteres alfanuméricos** (ver dívida técnica de percent-encoding
   acima) até o `config.py` ser corrigido
4. Em **Project Settings → API**, anote:
   - `Project URL` → `SUPABASE_URL`
   - Publishable key → `SUPABASE_ANON_KEY`
   - Secret key → `SUPABASE_SERVICE_ROLE_KEY`

### 2. Configurar Google OAuth

1. Acesse https://console.cloud.google.com/apis/credentials
2. Crie um projeto dedicado (ex: `erp-gasfavero`) → **APIs & Services →
   OAuth consent screen** → preenche App Information, Audience
   (External), Contact Information → Create
3. **Credentials → Create Credentials → OAuth client ID** → tipo
   Web application
4. Em **Authorized redirect URIs**, adicione:
   `https://<seu-projeto>.supabase.co/auth/v1/callback`
5. No Supabase: **Authentication → Providers → Google** → cole o
   Client ID e Client Secret gerados

### 3. Variáveis de ambiente

No `.env` local e nas variáveis de ambiente do Railway (backend):

```env
PROJECT_NAME=gasfavero
STACK_NAME=gasfavero
SUPABASE_URL=https://<seu-projeto>.supabase.co
SUPABASE_ANON_KEY=<publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<secret-key>
POSTGRES_SERVER=<host-do-pooler>
POSTGRES_PORT=5432
POSTGRES_DB=postgres
POSTGRES_USER=<usuario-do-pooler>
POSTGRES_PASSWORD=<senha-do-banco, sem caracteres especiais por ora>
SECRET_KEY=<gerado com secrets.token_urlsafe(32), fixo>
FIRST_SUPERUSER=<email do admin inicial>
FIRST_SUPERUSER_PASSWORD=<senha forte>
```

### 4. Aplicar migrations (RBAC incluso)

```powershell
cd backend
uv run alembic upgrade head
uv run python -m app.initial_data
```

As tabelas `role`, `module`, `role_permission` e `user_role` já estão
definidas nas migrations herdadas do `erp-core-template`. O
`initial_data` cria o superusuário e popula os roles/módulos padrão.

### 5. Railway (backend)

1. Acesse https://railway.app e conecte a conta GitHub
2. New Project → Deploy from GitHub repo → `ricardoshuree/gasfavero`
3. No serviço criado, em **Settings → Source → Root Directory**,
   define `backend`
4. Em **Settings → Build → Builder**, force `Railpack` — o Railway
   detecta o `backend/Dockerfile` automaticamente e tenta usá-lo, o
   que quebra o build (ver dívida técnica acima)
5. Em **Settings → Deploy → Custom Start Command**:
   `uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. Configure as variáveis de ambiente (mesmas do `.env`, ver acima) via
   **Variables → Raw Editor**
7. **Networking → Generate Domain** para obter a URL pública

---

## CI/CD

A cada push ou PR na `main`, o GitHub Actions executa automaticamente:

| Workflow | O que faz | Tempo |
|---|---|---|
| `test-rbac.yml` | 10 testes RBAC com SQLite, sem Docker | ~25s |

Para ativar o gate de qualidade (bloquear merge se os testes falharem):
GitHub → Settings → Branches → Add rule → `main` → marcar
"Require status checks to pass" → selecionar "RBAC unit tests"

---

## Plataformas de hospedagem

| Serviço | Plataforma | O que cobre |
|---|---|---|
| Frontend | Vercel | Build e deploy automático via GitHub |
| Backend | Railway | Deploy do FastAPI, auto-deploy via GitHub |
| Banco + Auth | Supabase | PostgreSQL gerenciado, Auth, RLS |

---

## Origem

Este repositório foi derivado do `erp-core-template` (fork do
[`fastapi/full-stack-fastapi-template`](https://github.com/fastapi/full-stack-fastapi-template))
via merge com histórico preservado (`--allow-unrelated-histories`), com
o `mcp-local` incorporado via `git subtree`. Segue o mesmo padrão de
isolamento planejado para os próximos ERPs (`dragrafavero` e o da
confecção).
