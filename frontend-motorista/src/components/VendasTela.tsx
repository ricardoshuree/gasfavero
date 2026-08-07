// [mcp-local harness] feature: frontend-motorista-redesign-ifood | plano: 46dc14df | 2026-08-07 19:19:17
// Placeholder Vendas estilo iFood (fundo branco, texto preto/cinza)
import type { CSSProperties } from "react"
import { CORES_APP as CORES } from "../theme"

function VendasTela() {
  return (
    <div style={estilos.pagina}>
      <h1 style={estilos.titulo}>Vendas</h1>
      <p style={estilos.mensagem}>
        Registro de venda em campo -- ainda em construção.
      </p>
    </div>
  )
}

const estilos: Record<string, CSSProperties> = {
  pagina: { padding: "1.25rem 1rem", color: CORES.texto },
  titulo: { fontSize: "1.35rem", fontWeight: 700, margin: "0 0 0.75rem" },
  mensagem: { color: CORES.textoSecundario, fontSize: "0.9rem" },
}

export default VendasTela
