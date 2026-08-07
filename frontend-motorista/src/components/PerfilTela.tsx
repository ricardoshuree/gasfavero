// [mcp-local harness] feature: frontend-motorista-redesign-ifood | plano: 46dc14df | 2026-08-07 19:19:34
// Perfil estilo iFood
import type { CSSProperties } from "react"
import type { UserMe } from "../lib/auth"
import { CORES_APP as CORES } from "../theme"

function PerfilTela({ usuario, onLogout }: { usuario: UserMe; onLogout: () => void }) {
  return (
    <div style={estilos.pagina}>
      <h1 style={estilos.titulo}>Perfil</h1>

      <div style={estilos.card}>
        <span style={estilos.nome}>{usuario.full_name || "(sem nome cadastrado)"}</span>
        <span style={estilos.email}>{usuario.email}</span>
      </div>

      <button style={estilos.botaoSair} onClick={onLogout}>
        Sair
      </button>
    </div>
  )
}

const estilos: Record<string, CSSProperties> = {
  pagina: { padding: "1.25rem 1rem", color: CORES.texto },
  titulo: { fontSize: "1.35rem", fontWeight: 700, margin: "0 0 1rem" },
  card: {
    background: CORES.fundoCard,
    border: `1px solid ${CORES.borda}`,
    borderRadius: "0.75rem",
    padding: "1rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.2rem",
    marginBottom: "1.25rem",
  },
  nome: { fontWeight: 700, fontSize: "1.05rem", color: CORES.texto },
  email: { fontSize: "0.85rem", color: CORES.textoSecundario },
  botaoSair: {
    width: "100%",
    padding: "0.85rem",
    borderRadius: "0.5rem",
    border: `1px solid ${CORES.borda}`,
    background: CORES.fundo,
    color: CORES.texto,
    fontWeight: 700,
    fontSize: "0.95rem",
  },
}

export default PerfilTela
