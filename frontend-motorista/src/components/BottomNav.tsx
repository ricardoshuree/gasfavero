// [mcp-local harness] feature: frontend-motorista-redesign-ifood | plano: 46dc14df | 2026-08-07 19:19:09
// BottomNav estilo iFood: fundo branco, aba ativa em vermelho, inativa cinza. Label "Demandas" vira "Chamadas" (display) -- id tecnico continua "demandas"
import type { CSSProperties } from "react"
import { CORES_APP as CORES } from "../theme"

const ALTURA_BOTTOMNAV_PX = 58

type AbaId = "demandas" | "vendas" | "financeiro" | "perfil"

// "demandas" é o id técnico (mesmo padrão DemandaVenda/Chamado já
// usado no backend) -- o label exibido é "Chamadas", nome que o
// negócio usa de verdade.
const ABAS: { id: AbaId; label: string; icone: string }[] = [
  { id: "demandas", label: "Chamadas", icone: "📋" },
  { id: "vendas", label: "Vendas", icone: "🧾" },
  { id: "financeiro", label: "Financeiro", icone: "💰" },
  { id: "perfil", label: "Perfil", icone: "👤" },
]

function BottomNav({
  abaAtiva,
  onMudarAba,
}: {
  abaAtiva: AbaId
  onMudarAba: (aba: AbaId) => void
}) {
  return (
    <nav style={estilos.barra}>
      {ABAS.map((aba) => {
        const ativa = aba.id === abaAtiva
        return (
          <button
            key={aba.id}
            onClick={() => onMudarAba(aba.id)}
            style={estiloItem(ativa)}
          >
            <span style={estiloIcone(ativa)}>{aba.icone}</span>
            <span style={estilos.label}>{aba.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function estiloItem(ativa: boolean): CSSProperties {
  return {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.2rem",
    border: "none",
    background: "transparent",
    color: ativa ? CORES.destaque : CORES.textoSecundario,
    fontWeight: ativa ? 700 : 400,
  }
}

function estiloIcone(ativa: boolean): CSSProperties {
  // Emojis são placeholder até os ícones de verdade (vermelhos,
  // pequenos, estilo iFood) entrarem -- Ricardo vai fornecer depois.
  return {
    fontSize: "1.15rem",
    lineHeight: 1,
    filter: ativa ? "none" : "grayscale(1) opacity(0.6)",
  }
}

const estilos: Record<string, CSSProperties> = {
  barra: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    height: ALTURA_BOTTOMNAV_PX,
    display: "flex",
    background: CORES.fundo,
    borderTop: `1px solid ${CORES.borda}`,
    paddingBottom: "env(safe-area-inset-bottom)",
    zIndex: 10,
    boxSizing: "content-box",
  },
  label: { fontSize: "0.65rem" },
}

export default BottomNav
export { ALTURA_BOTTOMNAV_PX }
export type { AbaId }
