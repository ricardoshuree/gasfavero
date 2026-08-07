// [mcp-local harness] feature: frontend-motorista-scaffold | plano: 10966b4b | 2026-08-07 16:26:22
// Config do Vite -- porta 5175 (dedicada, pra nao colidir com o frontend principal em 5173/5174)
import react from "@vitejs/plugin-react-swc"
import { defineConfig } from "vite"

// Porta dedicada 5175: o frontend principal (ERP) já usa 5173/5174.
// Rodar os dois ao mesmo tempo (ERP + app do motorista) durante o
// desenvolvimento não deve exigir derrubar um pra testar o outro.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    strictPort: true,
  },
})
