# mcp-local-erp

Servidor MCP local de **leitura e escrita** de arquivos de um projeto, para
uso com o Claude Desktop. Cada projeto (ex: `erp-distribuidora`,
`erp-consultorio`, `erp-confeccao`...) recebe sua própria cópia desta pasta,
com um `config.yaml` próprio. Isso permite que vários projetos rodem em
paralelo, cada um aparecendo com um nome distinto dentro do Claude Desktop.

Toda escrita de arquivo passa por um **harness de controle de mudanças**:
nenhuma alteração acontece sem um plano prévio (feature + arquivos
envolvidos) aprovado explicitamente. Veja a seção
[Harness de controle de mudanças](#harness-de-controle-de-mudanças) abaixo.

## Estrutura

```
mcp-local-erp/
├── config.yaml         # nome do projeto e raiz de arquivos que o servidor enxerga
├── server.py            # define as ferramentas (read_file, write_file, list_dir, harness)
├── change_control.py    # implementação do harness: planos, aprovação, log de auditoria
├── start.py             # registra este servidor no Claude Desktop
├── pyproject.toml       # dependências (fastmcp, pyyaml, psutil)
├── mcp_audit.jsonl       # log append-only de todo evento do harness (versionado no Git)
├── mcp_state.json        # planos pendentes/aprovados (transitório — não versionado)
└── README.md
```

`mcp_state.json` e `mcp_audit.jsonl` ficam **sempre dentro desta pasta**
(`mcp-local-erp/`), nunca dentro do projeto que o servidor gerencia — mesmo
quando `root_path` aponta para fora dela. Veja o porquê em
[Arquivos gerados pelo harness](#arquivos-gerados-pelo-harness).

---

## Instalação (primeira vez na máquina)

### 1. Python

Verifique se já está instalado:

```powershell
python --version
```

Se não retornar nada, instale a versão 3.11 ou superior:

| Sistema | Comando |
|---|---|
| Windows | `winget install Python.Python.3.12` |
| macOS | `brew install python@3.12` |
| Linux | `sudo apt install python3 python3-venv` |

### 2. uv (gerenciador de dependências)

| Sistema | Comando |
|---|---|
| Windows (PowerShell) | `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 \| iex"` |
| macOS / Linux | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |

Feche e reabra o terminal depois de instalar, para o `uv` entrar no PATH.

### 3. Dependências do projeto

Dentro da pasta `mcp-local-erp`:

```powershell
cd C:\project-claude\mcp-local
uv sync
```

Isso cria um `.venv` local e instala tudo conforme o `pyproject.toml`.

---

## Configuração

Edite o `config.yaml` antes de registrar:

```yaml
project_name: mcp-local-erp    # nome único — é o que aparece no Claude Desktop
environment: dev                # dev | prod — identifica o ambiente na auditoria
root_path: ../                  # pasta raiz do projeto que este servidor pode ler/escrever
allowed_extensions:              # extensões que write_file tem permissão de gravar
  - .py
  - .tsx
  - .ts
  - .json
  - .yaml
  - .md
blocked_dirs:                     # diretórios nunca acessíveis, nem para leitura
  - node_modules
  - .git
  - .venv
```

`mcp-local-erp` é o nome padrão de fábrica do pacote. Ao colocar esta pasta
dentro de um projeto específico (`erp-distribuidora`, `erp-consultorio`,
`erp-confeccao`...), troque `project_name` para um nome único por projeto —
é o que diferencia os servidores quando mais de um estiver rodando ao mesmo
tempo no Claude Desktop.

`root_path` define o escopo de `read_file` / `list_dir` / `write_file` — ou
seja, o projeto que este servidor enxerga e pode alterar. Isso é
propositalmente diferente de onde o harness guarda seu próprio estado (ver
seção seguinte).

---

## Registro no Claude Desktop

### Passo 1 — Feche o Claude Desktop por completo

Isso é obrigatório, não opcional. O Claude Desktop mantém o
`claude_desktop_config.json` em memória enquanto está aberto; se ele
continuar rodando durante o registro, pode sobrescrever o arquivo com o
estado antigo ao ser fechado depois — apagando a entrada nova sem aviso.

No Windows:

1. Clique com o botão direito no ícone do Claude na bandeja do sistema →
   **Sair / Quit**.
2. Confirme que não sobrou processo algum:
   ```powershell
   Get-Process Claude -ErrorAction SilentlyContinue
   ```
   Se não retornar nada, está encerrado.

### Passo 2 — Rode o script de registro

```powershell
uv run start.py
```

O script:
- **detecta automaticamente** onde este Windows guarda o
  `claude_desktop_config.json` — cobre tanto instalação via **Microsoft
  Store (MSIX)** (`%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\`)
  quanto a **instalação tradicional** (`%APPDATA%\Claude\`). Isso importa:
  editar o arquivo errado é a causa mais comum de "registrei mas não
  apareceu";
- **limpa processos órfãos** de `server.py` deste projeto — instâncias
  presas de sessões anteriores cujo processo pai (o Claude Desktop) já
  fechou. Só encerra processo com pai morto; nunca mexe em processo com o
  Claude Desktop ainda rodando;
- lê o `project_name` do `config.yaml` e, se a entrada ainda não existir,
  adiciona automaticamente (com backup do arquivo original antes de
  qualquer alteração); se já existir, apenas avisa e não altera nada;
- em qualquer um dos dois casos, relê o arquivo no final e mostra a lista
  de servidores registrados, como conferência.

Se `mcp-local-erp` (ou o nome que você definiu) não aparecer nessa lista
final, **não abra o Claude Desktop ainda** — confirme antes se o processo
estava mesmo encerrado no Passo 1.

### Passo 3 — Abra o Claude Desktop

O novo servidor MCP aparece na lista de ferramentas conectadas com o nome
definido em `project_name`.

---

## Harness de controle de mudanças

Nenhuma escrita acontece "direto". Toda alteração de arquivo passa
obrigatoriamente por um plano prévio, revisado por você, antes de o
conteúdo ser gravado. Isso dá rastreabilidade clara do propósito de cada
mudança e impede que várias alterações aconteçam sem revisão.

### O processo, passo a passo

```
 ┌──────────────────────────┐
 │ 1. propose_change         │  Claude declara: feature, descrição do
 │    (Claude chama)         │  propósito, e a lista exata de paths que
 │                           │  serão criados/alterados.
 └────────────┬──────────────┘
              │  grava plano com status "pending"
              │  em mcp_state.json (dentro de mcp-local-erp/)
              ▼
 ┌──────────────────────────┐
 │ 2. revisão humana          │  Você lê o plano exibido na conversa:
 │    (você decide)          │  feature, arquivos, propósito.
 └────────────┬──────────────┘
              │
      ┌───────┴────────┐
      │                │
   aprovado          rejeitado
      │                │
      ▼                ▼
 ┌───────────────┐  ┌───────────────────┐
 │ 3. approve_    │  │ reject_change      │
 │    change      │  │ (Claude chama)      │
 │ (Claude chama) │  │ plano vira          │
 │ plano vira     │  │ "rejected" — fim    │
 │ "approved"     │  └───────────────────┘
 └───────┬────────┘
         ▼
 ┌────────────────────────────────────┐
 │ 4. write_file(rel_path, content,    │
 │    plan_id, feature, description)   │
 │                                     │
 │  Antes de gravar, verifica:         │
 │    - rel_path é um arquivo interno  │
 │      reservado do harness? recusa   │
 │    - plan_id existe?                │
 │    - status == "approved"?          │
 │    - rel_path está na lista de      │
 │      files do plano?                │
 │                                     │
 │  Se qualquer checagem falhar        │
 │  → recusa com erro, nada é gravado. │
 │                                     │
 │  Se tudo OK:                        │
 │    - injeta comentário de           │
 │      rastreabilidade no topo do     │
 │      arquivo (feature, plano, data) │
 │    - grava o arquivo (dentro de     │
 │      ROOT, o projeto gerenciado)    │
 │    - registra o evento em           │
 │      mcp_audit.jsonl (dentro de     │
 │      mcp-local-erp/)                │
 └────────────────────────────────────┘
```

### Ferramentas do harness

| Ferramenta MCP | Quando usar | Efeito |
|---|---|---|
| `propose_change(feature, description, files)` | Antes de qualquer alteração | Cria plano `pending`, devolve `plan_id` |
| `approve_change(plan_id)` | Depois que você aprovar na conversa | Plano vira `approved` |
| `reject_change(plan_id)` | Se você recusar o plano proposto | Plano vira `rejected` |
| `list_pending_changes(status)` | Para conferir o que está pendente/aprovado/rejeitado | Lista os planos filtrados por status |
| `write_file(rel_path, content, plan_id, feature, description)` | Só depois do plano aprovado | Grava o arquivo com comentário de rastreabilidade; recusa se o plano não cobrir `rel_path` |
| `read_file(rel_path)` | A qualquer momento | Leitura livre, sem exigir plano (não altera nada) |
| `list_dir(rel_path)` | A qualquer momento | Leitura livre da árvore de arquivos |

### Arquivos gerados pelo harness

- **`mcp_state.json`** — os planos e seus status (`pending` / `approved` /
  `rejected`) e quais escritas cada plano já cobriu. Não é versionado
  (está no `.gitignore`): é estado de trabalho, não histórico.
- **`mcp_audit.jsonl`** — log append-only, uma linha JSON por evento
  (`propose`, `approve`, `reject`, `write`), com timestamp. **Este arquivo
  é versionado** — é o seu histórico auditável de quem pediu e aprovou o
  quê, mesmo depois de o plano ter saído do `mcp_state.json`.

Os dois arquivos vivem sempre em `HARNESS_ROOT`
(`Path(__file__).parent` em `server.py`, ou seja, a própria pasta
`mcp-local-erp/`) — **não** em `ROOT` (`root_path` do `config.yaml`, que é
o projeto gerenciado, ex: `erp-distribuidora/`). Essa separação é
intencional: `ROOT` muda de projeto para projeto e pode até apontar para
fora desta pasta, mas o bookkeeping do harness precisa ficar contido e
previsível, sempre no mesmo lugar, independente de onde `root_path` aponte.
Por isso também `write_file` recusa qualquer tentativa de gravar em um
arquivo chamado `mcp_state.json` ou `mcp_audit.jsonl` — mesmo com plano
aprovado — para que o próprio fluxo de aprovação não possa corromper seu
próprio estado.

### Exemplo de recusa (proteção funcionando)

Se o Claude tentar escrever em um arquivo fora do escopo aprovado:

```
ValueError: Arquivo 'app/models/pagamento.py' não está no escopo
declarado do plano 'a1b2c3d4' (['server.py', 'change_control.py']).
Proponha um novo plano cobrindo este arquivo.
```

Isso é o comportamento esperado: qualquer expansão de escopo exige um novo
plano — e uma nova aprovação sua.

---

## Reaproveitando em projetos futuros

Esta pasta é autocontida — nada nela depende de algo externo. Para usar em
um novo projeto:

1. Copie a pasta `mcp-local-erp` inteira para dentro do repositório.
2. Ajuste `project_name` e `root_path` no `config.yaml`.
3. Repita os passos de **Registro no Claude Desktop** acima.

Não é um pacote instalável (não vai pro PyPI, não é importado por outro
código) — é um servidor autônomo, então não precisa de nenhum ajuste de
packaging além do que já está pronto aqui.

---

## Troubleshooting

**Erro `Failed to build mcp-local` mencionando `hatchling` ou
`only-include`:** o `pyproject.toml` já vem corrigido com
`[tool.uv] package = false`, que avisa o `uv` para instalar dependências e
rodar os scripts sem tentar empacotar nada. Se aparecer de novo, confirme
que seu `pyproject.toml` tem esse bloco e **não** tem uma seção
`[build-system]`.

**A entrada some do `claude_desktop_config.json` depois de reiniciar o
Claude Desktop:** o app estava aberto durante o registro. Siga o Passo 1
da seção de Registro à risca antes de rodar `start.py` de novo.

**A entrada nunca aparece na tela "Servidores MCP locais", mesmo o
terminal confirmando o registro:** o script pode ter escrito no arquivo
tradicional (`%APPDATA%\Claude\`) enquanto sua instalação do Claude
Desktop é via Microsoft Store (MSIX), que lê de
`%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\`. A versão
atual do `start.py` já detecta isso automaticamente e imprime qual
caminho encontrou — confira a linha "Config detectado" no início da
saída para confirmar qual arquivo está sendo usado.

**`spawn uv ENOENT` nos logs do Claude Desktop:** o app não achou o
executável do `uv` no seu próprio PATH (que pode ser mais restrito que o
do terminal). O `start.py` já resolve o caminho absoluto do `uv`
automaticamente; se o aviso aparecer na tela, rode `where uv` e confirme
o caminho manualmente no `claude_desktop_config.json`.

**`write_file` recusa com "Plano não encontrado" ou "não aprovado":** o
harness está funcionando como esperado — chame `propose_change` (e,
depois da sua aprovação, `approve_change`) antes de tentar escrever.

**`write_file` recusa dizendo que o arquivo é "interno do harness":**
também esperado — `mcp_state.json` e `mcp_audit.jsonl` nunca podem ser
alvo de `write_file`, mesmo com plano aprovado; são gerenciados só pelas
funções internas de `change_control.py`.

---

## Observação importante

Rodar `python server.py` diretamente no terminal **não faz nada visível**
— o servidor fica esperando mensagens no stdin. Quem inicia o processo de
fato é o Claude Desktop, usando o comando registrado pelo `start.py`. Use
o `start.py` apenas para garantir o registro; o "start" do servidor em si
acontece automaticamente quando o Claude Desktop abre.
