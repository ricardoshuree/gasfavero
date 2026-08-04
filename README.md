<!--
[mcp-local harness] feature: docs-readme-closed-signup | plano: 847c0771 | 2026-08-04 12:05:59
Atualiza README: sistema fechado documentado em todas as secoes relevantes, novo item na tabela de portabilidade (users.py), secao de Debitos tecnicos, checklist atualizado
-->
# gasfavero

ERP do GAS Favero (controle de vendas). Instância isolada derivada do
[`erp-core-template`](https://github.com/ricardoshuree/erp-core-template),
com o [`mcp-local`](https://github.com/ricardoshuree/mcp-local) embarcado
como subtree em `mcp-local/` — monólito autocontido, sem dependência de
outros projetos ativos.

**Status**: backend em produção no Railway
(`https://backend-gasfavero.up.railway.app/docs`), frontend em produção
na Vercel (`https://gasfavero.vercel.app`). **RBAC e Supabase Auth (login
local + Google OAuth) testados de ponta a ponta em produção e
funcionando, sistema fechado (só admin cadastra, ver seção de
Autenticação).** Este README documenta a jornada completa — inclusive
os bugs encontrados e corrigidos — para servir de base ao backport pro
`erp-core-template` (ver seção dedicada abaixo) e como checklist para os
próximos ERPs (`erp-consultorio`, confecção).

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Python 3.14, FastAPI, SQLModel, Alembic, Argon2 |
| Frontend | React, TypeScript, Tailwind CSS, shadcn/ui, TanStack Router |
| Banco | PostgreSQL via Supabase (produção) / SQLite in-memory (testes) |
| Auth | Supabase Auth (Email + Google OAuth), sistema fechado — testado e funcionando |
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
│   │   ├── api/routes/
│   │   │   └── users.py        ← inclui POST /signup (DESABILITADO, ver Autenticação)
│   │   ├── core/               ← config, db, security, supabase_auth
│   │   └── models.py           ← todos os modelos SQLModel (inclui RBAC)
│   ├── Dockerfile              ← usado no Railway (backend isolado)
│   ├── Dockerfile.monorepo-unused ← NÃO usar (builda frontend+backend juntos)
│   ├── .python-version         ← 3.14, duplicado da raiz (Railpack precisa)
│   └── tests/rbac/              ← testes de RBAC (SQLite, sem Docker)
├── frontend/
│   ├── vite.config.ts          ← outDir: "dist" (NÃO o default do template original)
│   ├── vercel.json             ← rewrite catch-all p/ SPA routing
│   └── src/
│       ├── hooks/
│       │   ├── useAuth.ts      ← autenticação (local + Google/Supabase)
│       │   └── usePermissions.ts ← permissões por módulo (usa OpenAPI.BASE)
│       ├── lib/supabase.ts     ← cliente Supabase (só auth, dados via backend)
│       └── routes/
│           ├── login.tsx               ← form local + botão "Continuar com Google"
│           └── signup-b2c-disabled.tsx ← DESABILITADA, sem link na UI, reservada p/ B2C futuro
├── .github/workflows/test-rbac.yml ← CI: roda testes RBAC a cada push/PR
├── .env.example                 ← variáveis necessárias (sem valores reais)
├── activate.ps1                 ← ativa venv do backend no Windows/VS Code
└── mcp-local/                   ← servidor MCP deste projeto (versionado, subtree)
    └── config.yaml               ← project_name: mcp-erp-gasfavero
```

---

## ⭐ O que é portável pro `erp-core-template` vs. o que fica só aqui

Esta seção existe pra guiar o backport. Regra geral: **vai pro template
tudo que é comportamento/arquitetura reaproveitável; fica aqui tudo que
é credencial ou identidade deste ERP específico.**

### Vai pro template (arquivos inteiros ou trechos específicos)

| Arquivo | O que levar | Por quê é genérico |
|---|---|---|
| `backend/pyproject.toml` | Dependência `cryptography` adicionada em `dependencies` | `PyJWKClient` (usado por `supabase_auth.py`) exige `cryptography` pra validar assinaturas ES256/RS256. Sem isso, qualquer ERP que ativar Supabase Auth quebra em runtime. |
| `backend/app/core/config.py` | Campos `SUPABASE_URL: str`, `SUPABASE_ANON_KEY: str \| None`, `SUPABASE_SERVICE_ROLE_KEY: str \| None` na classe `Settings` | Sem isso, `Settings()` não expõe esses valores como atributo (mesmo estando no `.env`, porque `extra="ignore"`), e `supabase_auth.py` quebra com `AttributeError` **no import do módulo** — derruba o backend inteiro no boot. Foi o bug mais sério da sessão de deploy inicial (CrashLoop no Railway). |
| `backend/app/core/supabase_auth.py` | Arquivo inteiro (novo) | Verificação de JWT do Supabase via JWKS, sem segredo compartilhado. Reaproveitável 100%, não tem nada específico do gasfavero. |
| `backend/app/api/deps.py` | Lógica de `get_current_user` com fallback aditivo (JWT local → JWT Supabase) e `_get_user_from_supabase` — **sistema fechado**: rejeita (403) e-mail não cadastrado em vez de auto-criar usuário | Login Google só funciona pra quem já foi cadastrado por um admin. Comportamento correto por padrão para qualquer ERP — abrir auto-cadastro deve ser uma decisão explícita, não o default. |
| `backend/app/api/routes/users.py` | Endpoint `POST /signup` **desabilitado** (retorna 403 sempre), lógica original preservada em comentário para reativação futura | Auto-cadastro público aberto por padrão é uma porta de entrada não controlada — qualquer ERP nasce fechado, abre só sob decisão consciente (ex: lançamento de canal B2C). |
| `backend/app/models.py` | Models de RBAC (`Role`, `Module`, `RolePermission`, `UserRole`, `ModulePermission`, `UserPermissions`) — **conferir se o template já tem, evitar duplicar** | Já está no template desde a `v1.0.0`; confirmar que a versão do template está alinhada com a do gasfavero antes de sobrescrever. |
| `backend/app/core/db.py` | Seed idempotente (`DEFAULT_ROLES`, `DEFAULT_MODULES`, `init_db`) — mesma ressalva acima | Idem — já existe no template, só validar consistência. |
| `backend/app/alembic/versions/..._add_rbac_tables.py` | Migration RBAC — **cuidado com `down_revision`** | Só copiar se o template ainda não tiver; se tiver, comparar hash de revisão em vez de sobrescrever, para não quebrar a cadeia de migrations. |
| `frontend/vite.config.ts` | `build.outDir: "dist"` (em vez do `../backend/app/frontend` herdado do template original) | O template original assume deploy single-container (FastAPI servindo o frontend). Nossa arquitetura é Vercel+Railway separados — outDir errado é a causa raiz de "Deployment Failed" na Vercel. |
| `frontend/vercel.json` | Arquivo inteiro (novo): rewrite catch-all `/(.*)"→ "/index.html"` | Toda SPA com client-side routing (TanStack Router, React Router, etc.) precisa disso, senão qualquer rota acessada direto (refresh, link direto) retorna 404 da própria Vercel. |
| `frontend/src/lib/supabase.ts` | Arquivo inteiro (novo) | Cliente Supabase JS só para auth. Reaproveitável 100%. |
| `frontend/src/hooks/useAuth.ts` | `loginWithGoogle()`, `useSupabaseSessionSync()` | Sincroniza sessão Supabase com o mesmo `localStorage["access_token"]` do resto do app — nenhum outro código precisa saber qual método de login foi usado. |
| `frontend/src/hooks/usePermissions.ts` | Uso de `OpenAPI.BASE` em vez de `fetch("/api/v1/...")` relativo | Caminho relativo só funciona se frontend e backend estiverem no mesmo domínio. Em qualquer arquitetura Vercel+Railway (domínios diferentes), a chamada relativa sempre falha silenciosamente. |
| `frontend/src/routes/login.tsx` | Botão "Continuar com Google" acima do form existente, **sem link de signup** | Puramente de UI, sem nada específico do gasfavero. |
| `frontend/src/routes/signup-b2c-disabled.tsx` | Arquivo inteiro (renomeado de `signup.tsx`) | Mantém o formulário pronto para reativação futura de auto-cadastro (ex: canal B2C), sem expor a rota `/signup` padrão nem link na UI. |
| `frontend/package.json` | Dependência `@supabase/supabase-js` | — |

### Fica de fora do template (específico deste projeto, nunca commitar/portar)

| Item | Onde vive | Por quê é local |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (valores reais) | `.env` local + Variables do Railway | Projeto Supabase é um por ERP. |
| `BACKEND_CORS_ORIGINS` (valor real: `https://gasfavero.vercel.app,...`) | Variables do Railway + `.env` local | Domínio Vercel é único por ERP. |
| Site URL / Redirect URLs configurados no Supabase Auth | Painel do Supabase (`Authentication → URL Configuration`) | Não é código — é configuração de infraestrutura, um Supabase por ERP. |
| Client ID / Client Secret do Google OAuth | Painel do Supabase (`Authentication → Providers → Google`) | Um projeto GCP por ERP (isolamento de credenciais). |
| `POSTGRES_*`, `FIRST_SUPERUSER*`, `SECRET_KEY` | `.env` local + Variables do Railway | Óbvio — credenciais reais nunca vão pro template. |
| Nome do domínio Railway (`backend-gasfavero.up.railway.app`) | Configuração do Railway | Um domínio por ERP. |
| Módulos de negócio específicos (ex: futuros `vendas`, `estoque-gas`) | Migrations locais deste repo | Módulos de RBAC específicos do domínio de negócio do gás, não fazem sentido num template genérico. |
| Lista de e-mails cadastrados (usuários reais) | Postgres do Supabase deste ERP | Cada ERP tem seus próprios usuários — nunca vai em código nem template. |

### ⚠️ Pegadinhas de configuração (não aparecem em `git diff`, mas quebram tudo)

Estas não são bugs de código — são passos de configuração manual que
**qualquer novo ERP vai precisar repetir**, porque vivem fora do
versionamento (painéis do Supabase/Railway/Vercel). Documentado aqui
porque foi a parte mais cara (em tempo) de debugar hoje:

1. **Provider Google no Supabase vem desabilitado por padrão.** Mesmo
   com o projeto GCP configurado corretamente, `Authentication →
   Providers → Google` precisa ser explicitamente ativado (toggle
   "Enable Sign in with Google") com Client ID e Client Secret colados
   nos campos — sem isso, o botão de login redireciona mas o Google
   OAuth nunca completa.
2. **Site URL do Supabase Auth nasce como `http://localhost:3000`.**
   Precisa ser trocado pro domínio real de produção
   (`Authentication → URL Configuration → Site URL`).
3. **Redirect URLs allowlist nasce vazia.** Adicionar pelo menos o
   domínio de produção e, se quiser cobrir preview deployments da
   Vercel, um wildcard tipo `https://<projeto>-*-<time>.vercel.app`.
4. **`BACKEND_CORS_ORIGINS` não é preenchido automaticamente em lugar
   nenhum.** Sem essa env var no Railway apontando pro domínio real da
   Vercel, toda chamada do frontend falha com "Network Error" genérico
   no browser — **mesmo que o backend responda 200 normalmente** (o
   navegador bloqueia a resposta antes dela chegar no JS por falta de
   header CORS; só aparece no log do servidor, nunca no da requisição
   que falhou).
5. **Depois do primeiro deploy do backend, rodar migrations + seed
   manualmente é obrigatório** — não acontece sozinho:
   ```powershell
   cd backend
   uv run alembic upgrade head
   uv run python -m app.initial_data
   ```
6. **`mcp-local`'s `write_file` NUNCA deve ser usado em arquivos
   `.json`** (`package.json`, `vercel.json`, `tsconfig.json`, etc.). A
   ferramenta injeta automaticamente um comentário de rastreabilidade
   no formato `# ...` no topo do arquivo — que é inválido em JSON
   (JSON não suporta comentários) e quebra o parse no build da Vercel
   (`Could not read package.json: Unexpected token '#'`). Sempre editar
   `.json` via comando de terminal (PowerShell `Get-Content`/`Set-Content`
   ou editor), nunca via MCP write.
7. **Renomear um projeto na Vercel não migra o domínio automaticamente.**
   O domínio antigo (`<nome-antigo>.vercel.app`) continua sendo o de
   produção até você editar manualmente em `Settings → Domains` e
   escolher se quer redirect (307) do domínio antigo pro novo ou removê-lo.
8. **Sistema fechado por padrão (desde a v2.2.0 do template): ninguém
   se auto-cadastra.** Um usuário novo (local ou Google) só entra
   depois de um admin criar a conta manualmente na tela "Usuários"
   (`POST /users/`, protegido por superuser). Isso vale tanto pro login
   Google (rejeita e-mail desconhecido com 403) quanto pro auto-cadastro
   local (endpoint `/signup` desabilitado, ver seção de Autenticação).
   **Ao cadastrar um novo usuário via Google, ele nasce sem role
   nenhuma** — lembrar de atribuir role manualmente na mesma tela.

---

## Módulo de segurança — RBAC

O controle de acesso é baseado em quatro tabelas:

```
Role           → papel do usuário ("admin", "editor", "viewer")
Module         → módulo do sistema ("clientes", "financeiro", "estoque"...)
RolePermission → matriz role × módulo com can_read e can_edit
UserRole       → associação usuário × role
```

Roles e módulos padrão criados automaticamente na primeira inicialização
(idempotente, seguro rodar N vezes):
- **Roles**: `admin` (leitura + edição), `editor` (leitura + edição), `viewer` (somente leitura)
- **Módulos**: `usuarios`, `configuracoes`

Proteção de rota no backend via `require_module_permission(module_name,
need_edit=False)` (factory de `Depends` em `deps.py`) — superusuários
passam direto, os demais precisam de `RolePermission.can_read`/`can_edit`
no módulo. No frontend, `usePermissions()` consome
`GET /api/v1/users/me/permissions` e expõe `canRead(module)` /
`canEdit(module)` para gatear UI e menu lateral.

Para adicionar um novo módulo específico do negócio (ex: `vendas`,
`estoque-gas`):
1. Crie a migration Alembic inserindo o módulo na tabela `module` (ou
   adicione em `DEFAULT_MODULES` em `db.py` se for um módulo padrão)
2. Proteja as rotas correspondentes com `require_module_permission("vendas")`
3. Adicione a entrada correspondente no menu lateral do frontend

---

## Autenticação — local + Google OAuth (Supabase Auth), sistema fechado

Testado e funcionando em produção. **Política: ninguém se auto-cadastra.
Só um admin cria contas.** Fluxo:

- **Login local** (e-mail/senha): `POST /api/v1/login/access-token`
  gera um JWT assinado com `SECRET_KEY` local — fluxo original do
  template, inalterado.
- **Login Google**: `useAuth().loginWithGoogle()` chama
  `supabase.auth.signInWithOAuth({ provider: "google", redirectTo:
  window.location.origin })`. O Supabase redireciona pro Google, volta
  com o consent, e a sessão resultante é sincronizada com
  `localStorage["access_token"]` via `useSupabaseSessionSync()`.
- **Backend**: `get_current_user` em `deps.py` tenta decodificar o
  token como JWT local primeiro; se falhar, tenta validar como JWT do
  Supabase via JWKS (`verify_supabase_token`, em `supabase_auth.py`).
  `_get_user_from_supabase` busca o usuário local por e-mail — **se
  não existir, rejeita com 403** ("Este e-mail não está cadastrado no
  sistema"), não cria automaticamente. Um usuário que já existe mas
  ainda não tem role recebe acesso ao próprio perfil apenas, até um
  admin atribuir role pela tela "Usuários".
- **Auto-cadastro local desabilitado**: `POST /api/v1/users/signup`
  retorna 403 sempre. A página correspondente no frontend foi renomeada
  de `/signup` para `/signup-b2c-disabled`, sem link em nenhum lugar da
  UI — só acessível por quem digitar a URL diretamente, e mesmo assim o
  submit falha com a mensagem do backend. Lógica original preservada em
  comentário em `users.py`, pronta pra reativação quando o canal de
  vendas B2C (cliente final / comprador varejista) for lançado.
- **Como cadastrar um usuário novo hoje**: um admin acessa a tela
  "Usuários" e cria a conta manualmente (`POST /users/`, protegido por
  superuser). Depois disso, esse e-mail pode logar tanto por senha
  quanto por Google.

Nenhuma mudança de comportamento no login local existente — zero
regressão pros usuários já cadastrados.

---

## Débitos técnicos

| # | Item | Status | Detalhe |
|---|---|---|---|
| 1 | Auto-cadastro aberto (login Google criava usuário pra qualquer e-mail; `/signup` local acessível a qualquer um) | ✅ **Resolvido** | Ver seção "Autenticação" acima. Corrigido e portado pro `erp-core-template` (`v2.2.0`). |
| 2 | Percent-encoding na senha do Postgres — `config.py` monta a URI sem escapar caracteres especiais (`@`, `#`, `!`, `&` quebram) | 🔧 Aberto | Contorno atual: senha do banco só alfanumérica. Fix real: `urllib.parse.quote_plus` em `SQLALCHEMY_DATABASE_URI`. Candidato a portar pro template quando corrigido. |
| 3 | `mypy --strict` com 4 avisos pré-existentes em `deps.py`/`users.py` (`.in_()` em coluna UUID, `dict` sem type args) | 🔧 Aberto, baixa prioridade | Falso-positivo conhecido do SQLModel com mypy strict. Não bloqueia CI (só `pytest` roda). Cosmético. |
| 4 | CI gate não ativado (`test-rbac.yml` roda mas não é obrigatório pra merge) | 🔧 Aberto, baixa prioridade | GitHub → Settings → Branches → Require status checks. |

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

Crie `frontend/.env` (não commitado) com:

```env
VITE_API_URL=http://localhost:8000
VITE_SUPABASE_URL=<mesma SUPABASE_URL do backend>
VITE_SUPABASE_ANON_KEY=<mesma SUPABASE_ANON_KEY do backend>
```

```bash
cd frontend
npm install   # ou: bun install
npm run dev   # ou: bun dev
```

App: http://localhost:5173

### Testes

```powershell
cd backend
uv run pytest tests/rbac/ -v   # roda sem banco externo (SQLite in-memory)
```

---

## Setup de infraestrutura — Supabase + Google OAuth + Railway + Vercel

Checklist completo do provisionamento deste ERP — todos os itens já
concluídos e validados em produção.

### Checklist

- [x] 1. Criar projeto no Supabase (Postgres + Auth)
- [x] 2. Coletar `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [x] 3. Criar OAuth 2.0 Client ID no Google Cloud Console
- [x] 4. Configurar redirect URI e ativar provider Google no Supabase Auth
- [x] 5. Preencher `.env` local com as credenciais
- [x] 6. Aplicar migrations (incluindo RBAC) no Postgres do Supabase
- [x] 7. Criar projeto no Railway e conectar ao repositório GitHub
- [x] 8. Configurar variáveis de ambiente no Railway (inclui `BACKEND_CORS_ORIGINS`)
- [x] 9. Validar deploy do backend em produção — `/docs` respondendo
- [x] 10. Frontend no Vercel — deployado, domínio `gasfavero.vercel.app`
- [x] 11. Login local testado ponta a ponta em produção
- [x] 12. Login Google testado ponta a ponta em produção
- [x] 13. RBAC validado (rota "Usuários" protegida, permissões corretas)
- [x] 14. Sistema fechado validado (signup local → 403, e-mail Google desconhecido → 403)

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
  não pela API REST autogerada). O RBAC de fato é aplicado em nível de
  aplicação (FastAPI `Depends`), não via Postgres RLS — o backend
  conecta como usuário `postgres` (bypassa RLS por padrão no Supabase),
  então RLS aqui serve como camada extra de defesa contra acesso
  direto via API REST autogerada, não como enforcement primário.
- **Conexão Postgres**: via **Session pooler** (porta 5432, host
  `aws-0-sa-east-1.pooler.supabase.com`), não Transaction pooler nem
  conexão direta — o Railway mantém o processo `uvicorn` rodando de
  forma persistente (não é serverless/stateless), então o Session
  pooler preserva o comportamento completo de sessão que o SQLModel
  precisa, só proxeando via IPv4.
- **Google OAuth consent screen**: criado em modo **Testing** (não
  verificado publicamente) — suficiente para uso interno do ERP.
  É preciso adicionar os e-mails que vão logar em **Google Auth
  Platform → Audience → Test users**, senão o Google recusa o login
  mesmo com client ID/secret corretos. **Nota**: essa allowlist do
  Google é uma camada extra, não a defesa principal — a defesa
  primária é o backend rejeitar e-mail desconhecido (ver Autenticação).
- **Rotação de credenciais**: durante o setup, a senha do Postgres, a
  `service_role` key do Supabase e o Client Secret do Google OAuth
  passaram em texto puro pelo chat de configuração em algum momento.
  Todas foram rotacionadas após o uso. Lição para os próximos ERPs:
  preferir descrever "copiei o valor" a colar o valor em si na
  conversa, mesmo com um assistente — evita rotação reativa.
- **Bug de percent-encoding na senha do Postgres**: ver seção "Débitos
  técnicos" acima.
- **Nome do serviço e domínio no Railway**: renomeados de `frontend`
  (erro de digitação original) para `backend`, e o domínio público de
  `frontend-production-35d5.up.railway.app` para
  `backend-gasfavero.up.railway.app`.
- **Nome do projeto e domínio na Vercel**: renomeado de
  `gasfavero-frontend` para `gasfavero` (URL mais curta e fácil de
  digitar/acessar: `gasfavero.vercel.app`). O domínio antigo
  (`gasfavero-frontend.vercel.app`) foi mantido com redirect 307 pro
  novo, em vez de removido — evita quebrar links já compartilhados.

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
8. **`RuntimeError: Frontend directory '.../frontend' does not
   exist`**: `backend/app/main.py` chamava `app.frontend("/",
   directory=FRONTEND_DIR)` incondicionalmente — método do FastAPI que
   monta os estáticos do frontend direto no backend, pensado pro modelo
   single-container original. Como o frontend não é buildado neste
   Dockerfile (fica no Vercel, separado), o diretório nunca existe, e
   esse método lançava exceção fatal em vez de ignorar silenciosamente.
   **Correção**: chamada tornada condicional à existência do diretório
   (`if FRONTEND_DIR.exists(): ...`).
9. **`AttributeError: 'Settings' object has no attribute
   'SUPABASE_URL'`** — CrashLoop completo do backend depois de ativar
   Supabase Auth. Causa: `SUPABASE_URL` estava no `.env` e nas
   Variables do Railway, mas nunca foi declarado como campo da classe
   `Settings` em `config.py` — como `extra="ignore"`, o pydantic-settings
   simplesmente descartava o valor em vez de expor como atributo, e
   `supabase_auth.py` quebrava ao tentar `settings.SUPABASE_URL` no
   import do módulo, derrubando o app inteiro no boot. **Correção**:
   campos `SUPABASE_URL: str`, `SUPABASE_ANON_KEY: str | None`,
   `SUPABASE_SERVICE_ROLE_KEY: str | None` adicionados explicitamente.

**Configuração final do serviço no Railway:**
- Nome do serviço: `backend`
- Domínio público: `backend-gasfavero.up.railway.app`
- Root Directory: `backend`
- Builder: `Dockerfile` (auto-detectado, `backend/Dockerfile`)
- Custom Build Command: vazio (definido no Dockerfile)
- Custom Start Command: vazio (definido no Dockerfile via `CMD`)
- Variáveis de ambiente: via **Variables → Raw Editor**, incluindo
  `BACKEND_CORS_ORIGINS` com os domínios reais da Vercel

### Deploy na Vercel — o caminho até funcionar

Dois bugs de configuração, ambos silenciosos (build "passava" mas o
resultado não funcionava):

1. **`vite.config.ts` com `outDir: "../backend/app/frontend"`**
   (herdado do template original, pensado pro modelo single-container).
   O `vite build` rodava com sucesso e gerava os assets, mas em um
   diretório que a Vercel não sabia procurar — ela espera
   `frontend/dist` por padrão. Erro: `No Output Directory named "dist"
   found after the Build completed`. **Correção**: `outDir: "dist"`.
2. **Sem `vercel.json`, rotas da SPA acessadas diretamente (não pela
   raiz) retornavam 404** — `/login` direto no navegador (ou refresh
   da página) batia num arquivo físico inexistente. **Correção**:
   `vercel.json` com rewrite catch-all:
   ```json
   { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
   ```
3. **`package.json` com comentário `#` inválido no topo**, injetado
   automaticamente pela ferramenta de escrita do `mcp-local` numa
   sessão anterior (ver pegadinha #6 na seção de portabilidade acima) —
   quebrava o parse JSON no build: `Could not read package.json:
   Unexpected token '#'`. Corrigido via terminal (nunca reescrever
   `.json` via MCP write).

### 1. Criar projeto no Supabase

1. Acesse https://supabase.com/dashboard e crie/entre na conta
2. Novo projeto → nome `gasfavero`, região mais próxima do Brasil
   (`South America (São Paulo)`), plano Free
3. Gere e guarde a senha do banco em local seguro — **prefira só
   caracteres alfanuméricos** (ver "Débitos técnicos" acima) até o
   `config.py` ser corrigido
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
5. Em **Google Auth Platform → Audience → Test users**, adicione os
   e-mails que vão logar (obrigatório enquanto o consent screen estiver
   em modo Testing)
6. No Supabase: **Authentication → Sign In / Providers → Google** →
   ativar o toggle "Enable Sign in with Google" → colar Client ID e
   Client Secret → Save

### 3. Configurar URLs de autenticação no Supabase

Em **Authentication → URL Configuration**:
- **Site URL**: `https://<seu-dominio>.vercel.app`
- **Redirect URLs**: adicionar `https://<seu-dominio>.vercel.app` e,
  opcionalmente, um wildcard para preview deployments
  (`https://<projeto>-*-<time>.vercel.app`)

### 4. Variáveis de ambiente

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
BACKEND_CORS_ORIGINS=https://<seu-dominio>.vercel.app
```

Na Vercel (frontend), variáveis de ambiente do projeto:

```env
VITE_API_URL=https://<seu-backend>.up.railway.app
VITE_SUPABASE_URL=<mesma SUPABASE_URL do backend>
VITE_SUPABASE_ANON_KEY=<mesma SUPABASE_ANON_KEY do backend>
```

### 5. Aplicar migrations (RBAC incluso)

```powershell
cd backend
uv run alembic upgrade head
uv run python -m app.initial_data
```

As tabelas `role`, `module`, `role_permission` e `user_role` já estão
definidas nas migrations herdadas do `erp-core-template`. O
`initial_data` cria o superusuário e popula os roles/módulos padrão —
idempotente, seguro rodar de novo a qualquer momento (ex: depois de
resetar o banco).

### 6. Railway (backend)

1. Acesse https://railway.app e conecte a conta GitHub
2. New Project → Deploy from GitHub repo → `ricardoshuree/gasfavero`
3. **Settings → Source → Root Directory**: `backend`
4. Garanta que `backend/Dockerfile` existe (o simples, exclusivo do
   backend — não o `Dockerfile.monorepo-unused`) — o Railway vai
   detectá-lo e usá-lo automaticamente como builder
5. **Settings → Build/Deploy**: deixe Custom Build Command e Custom
   Start Command vazios — tudo já está definido no Dockerfile
6. Configure as variáveis de ambiente (ver seção 4 acima) via
   **Variables → Raw Editor**
7. **Networking → Generate Domain**, depois customize o subdomínio
   (ex: `backend-gasfavero`) clicando direto no campo de domínio
8. Renomeie o serviço: clique duas vezes no nome no topo do painel do
   serviço (abre edição inline — não fica em Settings)
9. Valide em `<dominio>/docs` que a API responde

### 7. Vercel (frontend)

1. Acesse https://vercel.com e faça login com GitHub (autoriza o
   acesso ao repositório quando solicitado)
2. New Project → importa o repositório do ERP
3. **Root Directory**: `frontend`
4. Framework preset: Vite (deve detectar automaticamente)
5. Variáveis de ambiente (ver seção 4 acima)
6. Deploy
7. Confirme que `frontend/vite.config.ts` tem `outDir: "dist"` e que
   `frontend/vercel.json` existe (ver "Deploy na Vercel" acima) — sem
   isso o deploy falha ou fica quebrado silenciosamente
8. Se quiser um domínio mais curto, renomeie o projeto em
   **Settings → General → Project Name**, depois vá em
   **Settings → Domains → Edit** no domínio `.vercel.app` gerado e
   ajuste manualmente (renomear o projeto não migra o domínio sozinho)
9. Volte no Google Cloud Console e Supabase e atualize as URLs com o
   domínio final (ver seções 2 e 3 acima)

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
confecção). A jornada completa de RBAC + Supabase Auth + sistema
fechado documentada neste README foi portada de volta pro
`erp-core-template` (tags `v2.0.0`–`v2.2.0`), para que os próximos ERPs
herdem tudo isso pronto e validado.
