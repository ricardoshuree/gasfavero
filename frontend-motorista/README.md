<!--
[mcp-local harness] feature: frontend-motorista-scaffold | plano: 10966b4b | 2026-08-07 16:27:20
README inicial do projeto -- contexto, comandos, estado atual (scaffold)
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

## Estado atual

Scaffold inicial (Vite + React + TypeScript). Ainda **sem** lógica de
negócio -- sem autenticação, sem chamadas à API do backend, sem as
telas reais. Serve só para validar que o projeto builda e que o
wrapper Android via Capacitor funciona de ponta a ponta.

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
