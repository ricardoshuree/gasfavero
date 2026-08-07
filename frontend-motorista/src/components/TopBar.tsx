// [mcp-local harness] feature: frontend-motorista-redesign-ifood | plano: 46dc14df | 2026-08-07 19:18:57
// TopBar estilo iFood: fundo branco, texto preto. Bolinha do toggle continua verde/cinza (sinalizacao universal, independente da paleta de marca)
import { type CSSProperties, useEffect, useRef, useState } from "react"
import { iniciarPing, pararPing } from "../lib/localizacao"
import { CORES_APP as CORES } from "../theme"

// Altura fixa exportada -- App.tsx usa isso pra dar padding-top no
// conteúdo e não deixar nada escondido atrás da barra.
const ALTURA_TOPBAR_PX = 52

function TopBar({ token, motoristaId }: { token: string; motoristaId: string }) {
  const [disponivel, setDisponivel] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const pingIdRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (pingIdRef.current !== null) pararPing(pingIdRef.current)
    }
  }, [])

  function alternar() {
    if (disponivel) {
      if (pingIdRef.current !== null) pararPing(pingIdRef.current)
      pingIdRef.current = null
      setDisponivel(false)
      return
    }
    setErro(null)
    const id = iniciarPing(token, motoristaId, () =>
      setErro("Falha ao enviar localização"),
    )
    pingIdRef.current = id
    setDisponivel(true)
  }

  return (
    <div style={estilos.barra}>
      <span style={estilos.nome}>Gás Favero</span>
      <div style={estilos.direita}>
        {erro && <span style={estilos.erro}>{erro}</span>}
        <button style={estiloToggle(disponivel)} onClick={alternar}>
          <span style={estiloPontinho(disponivel)} />
          {disponivel ? "Disponível" : "Indisponível"}
        </button>
      </div>
    </div>
  )
}

function estiloToggle(ativo: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    padding: "0.35rem 0.7rem",
    borderRadius: "999px",
    border: `1px solid ${ativo ? CORES.statusOn : CORES.borda}`,
    background: ativo ? "rgba(34,197,94,0.1)" : CORES.fundoCard,
    color: CORES.texto,
    fontSize: "0.75rem",
    fontWeight: 700,
  }
}

function estiloPontinho(ativo: boolean): CSSProperties {
  return {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: ativo ? CORES.statusOn : CORES.statusOff,
  }
}

const estilos: Record<string, CSSProperties> = {
  barra: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    height: ALTURA_TOPBAR_PX,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 0.75rem",
    paddingTop: "env(safe-area-inset-top)",
    background: CORES.fundo,
    borderBottom: `1px solid ${CORES.borda}`,
    zIndex: 10,
    boxSizing: "border-box",
  },
  nome: { fontWeight: 700, fontSize: "0.95rem", color: CORES.texto },
  direita: { display: "flex", alignItems: "center", gap: "0.5rem" },
  erro: { fontSize: "0.7rem", color: CORES.erro },
}

export default TopBar
export { ALTURA_TOPBAR_PX }
