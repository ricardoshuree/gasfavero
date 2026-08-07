// [mcp-local harness] feature: frontend-motorista-confirmacao-alarme | plano: 2f3cb9a2 | 2026-08-07 19:32:17
// Modal de confirmacao generico (overlay + card, dois botoes) -- substitui window.confirm
import type { CSSProperties, ReactNode } from "react"
import { CORES_APP as CORES } from "../theme"

/** Modal de confirmação genérico -- evita ação acidental em botões
 * importantes (mesmo padrão já usado no frontend principal pra baixa
 * de vale: Dialog em vez de window.confirm nativo). */
function ConfirmDialog({
  aberto,
  titulo,
  mensagem,
  textoConfirmar = "Confirmar",
  textoCancelar = "Cancelar",
  corConfirmar = CORES.aceito,
  corConfirmarTexto = CORES.aceitoTexto,
  onConfirmar,
  onCancelar,
}: {
  aberto: boolean
  titulo: string
  mensagem: ReactNode
  textoConfirmar?: string
  textoCancelar?: string
  corConfirmar?: string
  corConfirmarTexto?: string
  onConfirmar: () => void
  onCancelar: () => void
}) {
  if (!aberto) return null

  return (
    <div style={estilos.overlay} onClick={onCancelar}>
      <div style={estilos.card} onClick={(e) => e.stopPropagation()}>
        <h2 style={estilos.titulo}>{titulo}</h2>
        <div style={estilos.mensagem}>{mensagem}</div>
        <div style={estilos.botoes}>
          <button style={estilos.botaoCancelar} onClick={onCancelar}>
            {textoCancelar}
          </button>
          <button
            style={{
              ...estilos.botaoConfirmar,
              background: corConfirmar,
              color: corConfirmarTexto,
            }}
            onClick={onConfirmar}
          >
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  )
}

const estilos: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1.5rem",
    zIndex: 100,
  },
  card: {
    background: CORES.fundo,
    borderRadius: "0.85rem",
    padding: "1.25rem",
    width: "100%",
    maxWidth: "340px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },
  titulo: { fontSize: "1.1rem", fontWeight: 700, margin: "0 0 0.5rem", color: CORES.texto },
  mensagem: { fontSize: "0.9rem", color: CORES.textoSecundario, marginBottom: "1.25rem" },
  botoes: { display: "flex", gap: "0.6rem" },
  botaoCancelar: {
    flex: 1,
    padding: "0.7rem",
    borderRadius: "0.5rem",
    border: `1px solid ${CORES.borda}`,
    background: "transparent",
    color: CORES.texto,
    fontWeight: 700,
    fontSize: "0.9rem",
  },
  botaoConfirmar: {
    flex: 1,
    padding: "0.7rem",
    borderRadius: "0.5rem",
    border: "none",
    fontWeight: 700,
    fontSize: "0.9rem",
  },
}

export default ConfirmDialog
