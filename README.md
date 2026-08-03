# mcp-local-erp

Servidor MCP local de **leitura e escrita** de arquivos de um projeto, para
uso com o Claude Desktop. Cada projeto (ex: `erp-distribuidora`,
`erp-consultorio`, `erp-confeccao`...) recebe sua própria cópia desta pasta,
com um `config.yaml` próprio. Isso permite que vários projetos rodem em
paralelo, cada um aparecendo com um nome distinto dentro do Claude Desktop.

## Estrutura

```
mcp-local-erp/
├── config.yaml      # nome do projeto e raiz de arquivos que o servidor enxerga
├── server.py         # define as ferramentas (read_file, write_file, list_dir)
├── start.py          # registra este servidor no Claude Desktop
├── pyproject.toml    # dependências (fastmcp, pyyaml, colorama)
└── README.md
```

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
project_name: mcp-local-erp   # nome único — é o que aparece no Claude Desktop
root_path: ../                 # pasta raiz do projeto que este servidor pode ler/escrever
```

`mcp-local-erp` é o nome padrão de fábrica do pacote. Ao colocar esta pasta
dentro de um projeto específico (`erp-distribuidora`, `erp-consultorio`,
`erp-confeccao`...), troque `project_name` para um nome único por projeto —
é o que diferencia os servidores quando mais de um estiver rodando ao mesmo
tempo no Claude Desktop.

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

---

## Observação importante

Rodar `python server.py` diretamente no terminal **não faz nada visível**
— o servidor fica esperando mensagens no stdin. Quem inicia o processo de
fato é o Claude Desktop, usando o comando registrado pelo `start.py`. Use
o `start.py` apenas para garantir o registro; o "start" do servidor em si
acontece automaticamente quando o Claude Desktop abre.
