// [mcp-local harness] feature: perfil-config-debug-gps | plano: fa7002dc | 2026-09-08 10:18:58
// PerfilTela: adiciona ⚙️ no canto superior direito que abre ConfiguracoesTela. Passa token como prop.
// PerfilTela — com ⚙️ no canto superior direito abrindo ConfiguracoesTela
import { useState, type CSSProperties } from "react"
import type { UserMe } from "../lib/auth"
import { CORES_APP as CORES } from "../theme"
import ConfiguracoesTela from "./ConfiguracoesTela"

interface Props {
  usuario: UserMe
  token: string
  onLogout: () => void
}

function PerfilTela({ usuario, token, onLogout }: Props) {
  const [abrirConfig, setAbrirConfig] = useState(false)

  if (abrirConfig) {
    return (
      <ConfiguracoesTela
        token={token}
        motoristaId={usuario.id}
        onVoltar={() => setAbrirConfig(false)}
      />
    )
  }

  return (
    <div style={estilos.pagina}>
      <div style={estilos.cabecalho}>
        <h1 style={estilos.titulo}>Perfil</h1>
        <button style={estilos.btnConfig} onClick={() => setAbrirConfig(true)} aria-label="Configurações">
          ⚙️
        </button>
      </div>

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
  cabecalho: {
    display: "flex", justifyContent: "space-between",
    alignItems: "center", marginBottom: "1rem",
  },
  titulo:  { fontSize: "1.35rem", fontWeight: 700, margin: 0 },
  btnConfig: {
    background: "transparent", border: "none",
    fontSize: "22px", cursor: "pointer", padding: "4px",
    lineHeight: 1,
  },
  card: {
    background: CORES.fundoCard, border: `1px solid ${CORES.borda}`,
    borderRadius: "0.75rem", padding: "1rem",
    display: "flex", flexDirection: "column",
    gap: "0.2rem", marginBottom: "1.25rem",
  },
  nome:    { fontWeight: 700, fontSize: "1.05rem", color: CORES.texto },
  email:   { fontSize: "0.85rem", color: CORES.textoSecundario },
  botaoSair: {
    width: "100%", padding: "0.85rem",
    borderRadius: "0.5rem", border: `1px solid ${CORES.borda}`,
    background: CORES.fundo, color: CORES.texto,
    fontWeight: 700, fontSize: "0.95rem",
  },
}

export default PerfilTela
