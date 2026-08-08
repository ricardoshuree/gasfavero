<!--
[mcp-local harness] feature: frontend-motorista-readme-handoff | plano: 2c332cc8 | 2026-08-07 21:39:21
README completo com handoff da sessao -- estado, decisoes, pendencias (som mudo detalhado), proximos passos
-->
# frontend-motorista

App Android híbrido (Capacitor) para os motoristas da Distribuidora
Gás Favero. Projeto separado do `frontend` principal do
`erp-gasfavero` -- deliberadamente enxuto, só com as telas que o
motorista precisa (fila de chamados, mapa, deep-link de navegação),
sem carregar o restante do ERP administrativo.

- **appId**: `com.gasfavero.motorista`
- **appName**: Gás Favero Motorista
- Distribuição planejada: APK sideload em aparelhos da própria
  empresa (não vai para a Play Store por enquanto)

## Estado atual (07/08/2026)

Base funcional rodando ponta a ponta -- web (`npm run dev`) e nativo
Android (emulador). Login real, navegação geral, e a tela de Chamados
("Chamadas") completas e testadas com dados reais de produção. Vendas,
Financeiro e Perfil ainda são placeholders "em construção".

### ✅ Login

- Email/senha contra o backend de produção (Railway), mesmo contrato
  do frontend principal (`POST /api/v1/login/access-token`,
  form-urlencoded)
- Token persistido via `@capacitor/preferences` (mais robusto que
  localStorage puro dentro do WebView nativo)
- `.env`: `VITE_API_URL=https://backend-gasfavero.up.railway.app`
  (aponta direto pra produção, decisão confirmada -- emulador/celular
  não alcançam localhost do PC de qualquer forma)

**CORS**: o backend de produção só liberava `gasfavero.vercel.app` --
foi necessário adicionar `http://localhost:5175` (dev) e
`https://localhost` (origem padrão do Capacitor no Android) em
`BACKEND_CORS_ORIGINS` no Railway. **Cuidado ao editar essa variável
direto no Railway** -- uma edição malfeita já derrubou o backend de
produção por alguns minutos numa sessão anterior (aspas soltas
quebrando o parsing). Sempre conferir o resultado no Raw Editor antes
de salvar.

### ✅ Tema (paletas)

`src/theme.ts` -- fonte única de verdade das cores, duas paletas:

- **`CORES_LOGIN`** -- paleta "camo" (verde `#283618`, oliva
  `#606C38`, bege `#C5C9A4`), usada **só** na tela de Login e no
  splash pré-autenticação
- **`CORES_APP`** -- paleta clara "estilo iFood" (pedido do cliente),
  usada em **todas as outras telas**: fundo branco `#FFFFFF`, texto
  preto `#1A1A1A`, destaque vermelho `#EA1D2C`, cards cinza claro
  `#F5F5F5` com área branca interna, azul `#2563EB` pro estado
  "aceito, aguardando chegada"

Qualquer tela nova deve importar de `theme.ts`, nunca hardcode hex.

### ✅ Navegação geral

- **TopBar** fixa no topo: nome do app + toggle "Disponível" /
  "Indisponível" (liga/desliga envio de ping de localização real via
  `navigator.geolocation` + `PUT /motoristas/{id}/localizacao`,
  arredondado pra 6 casas decimais -- o backend exige
  `decimal_places=6`)
- **BottomNav** fixa embaixo: 4 abas -- **Chamadas** (funcional),
  Vendas, Financeiro, Perfil (placeholders)
- Sem router (`react-router`/`tanstack-router`) de propósito -- app
  pequeno, navegação por estado local (`abaAtiva` em `App.tsx`) é
  suficiente e mais enxuto

### ✅ Tela "Chamadas" (nome de exibição; internamente ainda
`DemandaVenda`/demandas -- mesmo padrão de divergência técnico/negócio
já usado no backend, ex: Item/Produto)

Duas sub-abas:

- **"Agora"** -- chamados abertos (qualquer motorista aceita) +
  convites diretos pendentes + já aceitos aguardando chegada. Ordem:
  abertos primeiro, depois convites, depois aceitos; dentro de cada
  grupo, **mais antigo primeiro (FIFO)** -- otimização por melhor
  trajeto fica fora de escopo por enquanto (exigiria integrar rota
  real, tipo Google Directions API)
- **"Atendidas"** -- só os concluídos **hoje** (data local do
  aparelho, mesmo espírito do filtro "Chamadas hoje" do painel do Mapa
  no frontend principal, mas simplificado -- sem fuso Brasília
  explícito)

Cards estilo iFood: cinza por fora, branco por dentro, botão vermelho
"Aceitar chamado" (abertos/convites), botão azul "Cheguei" (aceitos),
sem botão nos atendidos (só dados, opacidade reduzida).

**Confirmação antes de "Cheguei"**: modal (`ConfirmDialog.tsx`, não é
`window.confirm` nativo) pra evitar toque acidental. Ao confirmar: (1)
flash verde rápido (~0.5s) no botão, (2) navega automaticamente pra
aba Vendas -- **não espera** o recarregamento da lista de chamados
(esse roda em paralelo, em segundo plano; antes disso causava uma
trava perceptível de vários segundos em rede mais lenta).

**Alerta de chamada nova** (`AlertaChamado.tsx`) -- simula o
comportamento estilo Uber: quando o polling (a cada 15s) detecta um
chamado NOVO que precisa de ação, dispara automaticamente:
- Tela cheia vermelha, "NOVO CHAMADO", dados do cliente
- Botão "Aceitar chamado" verde `#00A63E`, texto branco
- Botão "Recusar" bem mais afastado (espaçamento proposital, evita
  toque acidental logo depois do Aceitar)
- Som em loop (ver seção Som abaixo)

**LIMITAÇÃO CONHECIDA (documentada no código)**: isso só funciona com
o app **aberto em primeiro plano** -- é o polling da própria tela que
detecta a novidade, não uma notificação real do sistema operacional.
Alertar com o app fechado/em segundo plano exige Firebase Cloud
Messaging (push nativo) + tela de alarme sobre a lock screen --
escopo bem maior, decisão de fazer depois.

### ⚠️ Som do alerta -- PENDÊNCIA ABERTA

- Referência de sons: **https://notificationsounds.com/** -- sempre
  baixar em **MP3** (não M4R, que é toque de iPhone; não OGG, suporte
  inconsistente fora do Android)
- Som escolhido: "No Problem" (jingle curto) -- arquivo em
  `public/sounds/alerta-chamado.mp3` (não versionado ainda? conferir
  no commit)
- Implementação atual (`lib/alarme.ts`): elemento `<audio loop>`
  tocado via `iniciarAlarme()`/`pararAlarme()`. Tentativa de
  "destravar" o autoplay na primeira interação do usuário
  (`desbloquearAudio()`, chamado uma vez em `App.tsx` via listener de
  `pointerdown` no documento inteiro)
- **Testado e AINDA NÃO tocou som** no teste mais recente (botão
  ficou visualmente perfeito, cores certas, mas mudo). Hipóteses a
  investigar na próxima sessão:
  - O clique que "desbloqueou" pode não ter sido reconhecido como
    gesture válido pelo navegador (testar clicar em um `<button>` de
    verdade, não em qualquer `div`)
  - Testar `audio.muted = false` explícito antes do play
  - Conferir se o arquivo `.mp3` realmente foi copiado pro `dist/` no
    build (Vite deveria copiar `public/` automaticamente, mas vale
    confirmar abrindo a network tab)
  - Testar tocar o som direto num clique de botão comum (sem
    depender do "desbloqueio" antecipado) pra isolar se é problema de
    autoplay policy ou algo mais
  - No Android nativo (Capacitor), pode ser necessário o plugin
    `@capacitor/haptics` ou algum ajuste de permissão de mídia --
    ainda não investigado

### ⏳ Ainda não iniciado

- **Vendas** (mobile) -- tela placeholder
- **Financeiro** (Livro de Vendas / Recebimento de Vale /
  Inadimplentes / Malote Motorista, todos escopados só aos dados do
  próprio motorista) -- 4 cards placeholder, nenhum funcional
- **Push notification real (FCM)** -- pra alertar com app
  fechado/minimizado; exige projeto Firebase + `@capacitor/push-notifications`
  + integração no backend pra disparar o push quando um chamado é
  criado
- **Deep-link Google Maps** -- abrir navegação automática pro
  endereço do chamado aceito
- **Tela de configuração de som** (mencionado, não implementado) --
  aba Perfil poderia ter um link pra trocar o som do alerta entre
  opções pré-baixadas

## Mudança relacionada no frontend PRINCIPAL

`frontend/src/routes/_layout/chamado.tsx` -- o combo "Motorista" da
tela de despacho listava **todos os usuários do sistema** (admin,
gerente, viewer...), não só motoristas de verdade. Corrigido pra
filtrar só quem tem a role RBAC "Motorista" (além da opção "Qualquer
motorista disponível"). Já commitado e em produção.

## Estado atual

Scaffold inicial (Vite + React + TypeScript). Ver seções acima pro
que já foi construído em cima do scaffold base.

## Comandos

Instalar dependências:

```
npm install
```

Rodar em modo dev (navegador, porta 5175):

```
npm run dev
```

Buildar e sincronizar com o projeto Android nativo:

```
npm run cap:sync
```

Abrir o projeto Android no Android Studio:

```
npm run cap:open
```

## Adicionando a plataforma Android (primeira vez)

Depois do `npm install`, rodar uma vez:

```
npx cap add android
```

Isso gera a pasta `android/` (não versionada, ver `.gitignore`) já
configurada com o `appId`/`appName` declarados em
`capacitor.config.ts`.

## Notas técnicas úteis pra próxima sessão

- **MCP bloqueia `.json`**: `write_file` injeta comentário de
  rastreabilidade que quebra JSON. Pra editar `package.json`, instalar
  pacotes via `npm install <pacote>` no terminal em vez de editar o
  arquivo direto (o npm reescreve o JSON sozinho, sem o comentário).
- **`.css` também bloqueado** por extensão no MCP -- todo estilo do
  app está inline (`style={{...}}` / objetos JS), não em arquivos CSS
  separados.
- **Terminal Windows**: sempre matar processos órfãos na porta 5175
  antes de rodar `npm run dev` de novo, se der erro de "porta em uso":
  ```powershell
  Get-NetTCPConnection -LocalPort 5175 -State Listen | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
  ```
- **Build sempre antes de `cap:sync`**: `npm run cap:sync` já roda
  `npm run build` internamente, mas rodar `npm run build` sozinho
  primeiro ajuda a isolar erros de TypeScript antes de mexer no
  Android Studio.
