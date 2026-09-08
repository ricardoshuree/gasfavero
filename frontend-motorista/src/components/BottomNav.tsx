// [mcp-local harness] feature: fix-visual-contraste-motorista | plano: 434ba222 | 2026-09-08 09:26:53
// BottomNav: ícone Vendas trocado para 📦
// BottomNav — ícone Vendas atualizado para 📦
import type { CSSProperties } from "react"
import { CORES_APP as CORES } from "../theme"

const ALTURA_BOTTOMNAV_PX = 58

type AbaId = "demandas" | "vendas" | "financeiro" | "perfil"

const ABAS: { id: AbaId; label: string; icone: string }[] = [
  { id: "demandas",   label: "Chamadas",   icone: "📋" },
  { id: "vendas",     label: "Vendas",     icone: "📦" },
  { id: "financeiro", label: "Financeiro", icone: "💰" },
  { id: "perfil",     label: "Perfil",     icone: "👤" },
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
          <button key={aba.id} onClick={() => onMudarAba(aba.id)} style={estiloItem(ativa)}>
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
