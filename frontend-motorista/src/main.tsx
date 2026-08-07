// [mcp-local harness] feature: frontend-motorista-scaffold | plano: 10966b4b | 2026-08-07 16:26:52
// Entry point React -- sem index.css (extensao .css bloqueada pelo MCP; estilo fica inline no App por enquanto)
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
