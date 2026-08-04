<!--
[mcp-local harness] feature: docs-supabase-auth-migration | plano: 39dd17b5 | 2026-08-04 00:46:04
Documenta a migracao para Supabase Auth feita autonomamente, passos manuais pendentes, e o plano de Vercel para quando o usuario retornar
-->
# gasfavero

ERP do GAS Favero (controle de vendas). Instância isolada derivada do
[`erp-core-template`](https://github.com/ricardoshuree/erp-core-template),
com o [`mcp-local`](https://github.com/ricardoshuree/mcp-local) embarcado
como subtree em `mcp-local/` — monólito autocontido, sem dependência de
outros projetos ativos.

**Status**: backend em produção no Railway, respondendo em
`https://backend-gasfavero.up.railway.app/docs`. Migração de auth para
Supabase (login Google) implementada em código mas **NÃO commitada nem
testada ponta a ponta** — ver seção dedicada abaixo antes de mexer.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Python 3.14, FastAPI, SQLModel, Alembic, Argon2 |
| Frontend | React, TypeScript, Tailwind CSS, shadcn/ui, TanStack Router |
| Banco | PostgreSQL via Supabase (produção) / SQLite in-memory (testes) |
| Auth | Supabase Auth (Email + Google OAuth) |
| Deploy | Vercel (frontend) + Railway (backend, via Dockerfile) |
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
│   │   ├── core/               ← config, db, security, supabase_auth (novo)
│   │   └── models.py           ← todos os modelos SQLModel
│   ├── Dockerfile              ← usado no Railway (backend isolado, ver infra)
│   ├── Dockerfile.monorepo-unused ← NÃO usar (builda frontend+backend juntos)
│   ├── .python-version         ← 3.14, duplicado da raiz (ver seção de infra)
│   └── tests/
│       └── rbac/               ← testes de RBAC (SQLite, sem Docker)
├── frontend/
│   └── src/
│       ├── components/Sidebar/ ← menu lateral dinâmico por role
│       ├── hooks/
│       │   ├── useAuth.ts      ← autenticação (local + Google/Supabase)
│       │   └── usePermissions.ts ← permissões por módulo
│       ├── lib/supabase.ts     ← cliente Supabase (novo, só auth)
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

## Migração para Supabase Auth (login Google) — trabalho em andamento

**IMPORTANTE: nada disso foi commitado ou pushado.** São edições locais
feitas via MCP enquanto você estava fora — sentam no disco como
alterações não commitadas até você revisar. Como o Railway só faz
auto-deploy em push pra `main`, a produção atual não foi tocada.

### O que foi implementado

- **`backend/app/core/supabase_auth.py`** (novo): verifica JWTs
  emitidos pelo Supabase Auth via JWKS (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
  — sem precisar de segredo compartilhado, só a `SUPABASE_URL` que já
  está configurada.
- **`backend/app/api/deps.py`**: `get_current_user` agora tenta o JWT
  local primeiro (fluxo original, `FIRST_SUPERUSER` e qualquer login
  por senha continuam funcionando sem mudança nenhuma) e, só se isso
  falhar, tenta validar como token do Supabase. Um usuário autenticado
  via Google que ainda não existe localmente é criado por e-mail, **sem
  nenhuma role atribuída** — precisa de um admin atribuir role antes de
  ter qualquer permissão além do próprio perfil.
- **`frontend/src/lib/supabase.ts`** (novo): cliente Supabase JS, só
  para autenticação — dados de negócio continuam passando pelo backend.
- **`frontend/src/hooks/useAuth.ts`**: adiciona `loginWithGoogle()` e
  um listener que sincroniza a sessão do Supabase com o mesmo
  `localStorage["access_token"]` que o resto do app já usa — nenhum
  outro arquivo (client OpenAPI, `usePermissions`, etc.) precisou mudar.
- **`frontend/src/routes/login.tsx`**: botão "Continuar com Google"
  acima do form de e-mail/senha existente, que continua intacto.
- **`frontend/package.json`**: adiciona `@supabase/supabase-js`.

### O que falta — passos manuais antes de usar

1. **`backend/pyproject.toml`** — não pôde ser editado (extensão `.toml`
   bloqueada pelo filtro do `mcp-local`, mesma trava de segurança já
   documentada pro `.env`). Adicionar manualmente à lista de
   `dependencies`:
   ```toml
   "cryptography>=42.0.0,<45.0.0",
   ```
   (necessário pro `PyJWKClient` verificar assinaturas ES256)
2. **`frontend/.env.example`** — também não pôde ser criado (mesmo
   motivo, extensão `.example`). Adicionar manualmente ao `.env` real
   do frontend (`frontend/.env`, criar se não existir):
   ```env
   VITE_API_URL=http://localhost:8000
   VITE_SUPABASE_URL=<mesma SUPABASE_URL do backend>
   VITE_SUPABASE_ANON_KEY=<mesma SUPABASE_ANON_KEY do backend>
   ```
3. **Instalar as dependências novas**:
   ```powershell
   cd backend
   uv sync
   cd ../frontend
   bun install   # ou npm install
   ```
4. **Testar localmente antes de commitar**: sobe backend e frontend
   local (`uv run uvicorn app.main:app --reload` +
   `bun dev`/`npm run dev`), clica em "Continuar com Google" na tela de
   login, confirma que:
   - O redirect pro Google e de volta funciona
   - Um `User` novo aparece na tabela `user` do Postgres (Supabase
     Table Editor) com o e-mail correto
   - `GET /api/v1/users/me` responde com esse usuário
   - Login local (e-mail/senha, `FIRST_SUPERUSER`) continua funcionando
     normalmente — não deve ter regressão nenhuma
5. **Conferir os claims do payload real**: `supabase_auth.py` assume
   que o payload tem `email` e opcionalmente
   `user_metadata.full_name` — não validado contra um token real do
   Supabase nesta sessão. Se o login falhar com "Token do Supabase sem
   claim de email" ou erro parecido, inspecionar o payload decodificado
   (`jwt.io` com o token, sem verificar assinatura, só pra olhar os
   claims) e ajustar `_get_or_create_user_from_supabase` em `deps.py`.
6. **Só depois disso tudo validado**: `git add`, `git commit`,
   `git push` — lembrando que o push aciona auto-deploy no Railway.
7. **Atribuir roles** pros usuários que logarem via Google — hoje
   entram sem nenhuma, só com acesso ao próprio perfil.

---

## Como rodar localmente

### Pré-requisitos

- Python 3.14+ — `winget install Python.Python.3.14` (Windows)
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

Checklist do processo de provisionamento deste ERP.

### Checklist

- [x] 1. Criar projeto no Supabase (Postgres + Auth)
- [x] 2. Coletar `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [x] 3. Criar OAuth 2.0 Client ID no Google Cloud Console
- [x] 4. Configurar redirect URI e ativar provider Google no Supabase Auth
- [x] 5. Preencher `.env` local com as credenciais
- [x] 6. Aplicar migrations (incluindo RBAC) no Postgres do Supabase
- [x] 7. Criar projeto no Railway e conectar ao repositório GitHub
- [x] 8. Configurar variáveis de ambiente no Railway
- [x] 9. Validar deploy do backend em produção — `/docs` respondendo
- [ ] 10. Frontend no Vercel — precisa de você (login/OAuth com GitHub
      não pode ser feito sem sua confirmação em tempo real)
- [ ] 11. Migração Supabase Auth (Google) — código pronto, falta
      instalar deps, testar e commitar (ver seção dedicada acima)

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
  rotacionadas após o uso. Lição para os próximos ERPs: preferir
  descrever "copiei o valor" a colar o valor em si na conversa, mesmo
  com um assistente — evita rotação reativa.
- **Bug de percent-encoding na senha do Postgres**: o `config.py`
  herdado do `erp-core-template` monta a URI de conexão concatenando
  `POSTGRES_USER:POSTGRES_PASSWORD@POSTGRES_SERVER` sem escapar
  caracteres especiais. Uma senha com símbolos como `@`, `#`, `!`, `&`
  quebra o parser da URI. Contorno usado: senha do banco só com
  caracteres alfanuméricos. **Dívida técnica**: aplicar
  `urllib.parse.quote_plus` na senha em `backend/app/core/config.py`.
- **Nome do serviço e domínio no Railway**: renomeados de `frontend`
  (erro de digitação original) para `backend`, e o domínio público de
  `frontend-production-35d5.up.railway.app` para
  `backend-gasfavero.up.railway.app`.

### Deploy no Railway — o caminho até funcionar

O deploy correto acabou sendo **Dockerfile próprio, simples, exclusivo
do backend** — não Railpack. Documentando a trilha completa porque cada
etapa intermediária tem uma lição para os próximos ERPs:

1. **`backend/Dockerfile` original (herdado do template) builda
   frontend+backend juntos** numa imagem só, com contexto de build
   esperado na raiz do repo, não em `backend/`. Incompatível com a
   arquitetura (Vercel + Railway separados). Renomeado para
   `Dockerfile.monorepo-unused` (mantido no repo como referência).
2. **Railway prioriza automaticamente qualquer arquivo `Dockerfile`**
   encontrado na Root Directory configurada, **mesmo com "Railpack"
   selecionado manualmente no dropdown da UI** — a escolha do builder
   na tela não é definitiva enquanto existir um Dockerfile físico no
   caminho.
3. **Tentativa com Railpack** (sem Dockerfile no caminho) esbarrou em
   dois arquivos de config que só existiam na raiz do workspace `uv`,
   fora da Root Directory `backend/`:
   - `uv.lock`: sem ele, Railpack não reconhecia `uv`, não instalava
     nenhuma dependência — crash loop `uv: command not found`
   - `.python-version` (`3.14` na raiz): sem ele dentro de `backend/`,
     Railpack usava Python `3.13.14` default, incompatível com
     `requires-python = ">=3.14,<4.0"` do `pyproject.toml`
   `backend/.python-version` foi criado como cópia. Trocou-se `uv` por
   `pip install --no-cache-dir .` nos comandos de build/start.
4. **Mesmo com `pip install` "bem-sucedido" no build, o runtime não
   encontrava `uvicorn`** (`No module named uvicorn`) — o Railpack
   builda em estágios separados (build vs. runtime) e só copia pro
   estágio final o que ele mesmo sabe gerenciar; pacotes instalados via
   `Custom Build Command` cru ficavam pra trás.
5. **Decisão: voltar para Dockerfile, mas um novo, simples e exclusivo
   do backend** — controle total sobre o que entra na imagem final, sem
   depender da heurística do Railpack. `backend/Dockerfile` atual:
   `FROM python:3.14-slim`, copia o código, `pip install .`, roda
   `python -m uvicorn ...` via shell form (`CMD ["sh", "-c", ...]`) para
   permitir expansão de `$PORT`.
6. **Ordem de `COPY` no Dockerfile importava**: copiar só o
   `pyproject.toml` antes do `pip install` (otimização clássica de
   cache de camada) quebrava, porque o build backend `hatchling` deste
   projeto precisa enxergar a pasta `app/` de verdade para montar o
   pacote wheel — não trabalha só com a lista de dependências. Corrigido
   copiando todo o código antes de instalar.
7. **`Custom Start Command` configurado na UI do Railway sobrepõe o
   `CMD` do Dockerfile**, e como não passa por shell, `$PORT` chegava
   literal (`--port $PORT` sem expandir) em vez do número real. Corrigido
   limpando o campo por completo — o `CMD` do Dockerfile assume.
8. **Último erro**: `RuntimeError: Frontend directory '.../frontend'
   does not exist`. O `backend/app/main.py` chama
   `app.frontend("/", directory=FRONTEND_DIR)` — método do FastAPI que
   monta os estáticos do frontend direto no backend, pensado pro modelo
   single-container original. Como o frontend não é buildado neste
   Dockerfile (fica no Vercel, separado), o diretório nunca existe, e
   esse método específico lança exceção fatal em vez de ignorar
   silenciosamente. **Correção**: chamada tornada condicional à
   existência do diretório (`if FRONTEND_DIR.exists(): ...`), preserva
   a opção de deploy single-container no futuro sem quebrar o deploy
   atual isolado.

**Configuração final do serviço no Railway:**
- Nome do serviço: `backend`
- Domínio público: `backend-gasfavero.up.railway.app`
- Root Directory: `backend`
- Builder: `Dockerfile` (auto-detectado, `backend/Dockerfile`)
- Custom Build Command: vazio (definido no Dockerfile)
- Custom Start Command: vazio (definido no Dockerfile via `CMD`)
- Variáveis de ambiente: 13 variáveis via **Variables → Raw Editor**
  (ver seção 3 abaixo)

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
3. **Settings → Source → Root Directory**: `backend`
4. Garanta que `backend/Dockerfile` existe (o simples, exclusivo do
   backend — não o `Dockerfile.monorepo-unused`) — o Railway vai
   detectá-lo e usá-lo automaticamente como builder
5. **Settings → Build/Deploy**: deixe Custom Build Command e Custom
   Start Command vazios — tudo já está definido no Dockerfile
6. Configure as variáveis de ambiente (mesmas do `.env`, ver acima) via
   **Variables → Raw Editor**
7. **Networking → Generate Domain**, depois customize o subdomínio
   (ex: `backend-gasfavero`) clicando direto no campo de domínio
8. Renomeie o serviço: clique duas vezes no nome no topo do painel do
   serviço (abre edição inline — não fica em Settings)
9. Valide em `<dominio>/docs` que a API responde

### 6. Vercel (frontend) — próximo passo, precisa de você

Não pode ser concluído sem sua presença: o login no Vercel passa por
autorização OAuth do GitHub, que exige confirmação sua em tempo real.
Quando voltar:

1. Acesse https://vercel.com e faça login com GitHub (autoriza o
   acesso ao repositório quando solicitado)
2. New Project → importa `ricardoshuree/gasfavero`
3. **Root Directory**: `frontend`
4. Framework preset: Vite (deve detectar automaticamente)
5. Variáveis de ambiente (mesmas do `frontend/.env`, ver seção da
   migração Supabase acima):
   - `VITE_API_URL` → `https://backend-gasfavero.up.railway.app`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Deploy
7. Depois do deploy: volta no Google Cloud Console e adiciona a URL do
   Vercel em **Authorized JavaScript origins** do OAuth Client (hoje só
   tem o redirect URI do Supabase, não a URL do frontend em si)
8. Também adicionar a URL do Vercel em `all_cors_origins` do backend
   (variável `BACKEND_CORS_ORIGINS` ou equivalente em
   `backend/app/core/config.py` — conferir o nome exato) para o
   frontend conseguir chamar a API sem erro de CORS

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
| Backend | Railway | Deploy do FastAPI via Dockerfile, auto-deploy via GitHub |
| Banco + Auth | Supabase | PostgreSQL gerenciado, Auth, RLS |

---

## Origem

Este repositório foi derivado do `erp-core-template` (fork do
[`fastapi/full-stack-fastapi-template`](https://github.com/fastapi/full-stack-fastapi-template))
via merge com histórico preservado (`--allow-unrelated-histories`), com
o `mcp-local` incorporado via `git subtree`. Segue o mesmo padrão de
isolamento planejado para os próximos ERPs (`dragrafavero` e o da
confecção).
