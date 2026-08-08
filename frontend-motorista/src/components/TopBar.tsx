// [mcp-local harness] feature: fase4-motorista-disponibilidade-cancelamento | plano: ab68610c | 2026-08-08 11:45:04
// Corrige import errado (era iniciarAlarme/pararAlarme, devia ser iniciarPing/pararPing de lib/localizacao)
import { type CSSProperties, useEffect, useRef, useState } from "react"
import { atualizarDisponibilidade, buscarMinhaDisponibilidade } from "../lib/disponibilidade"
import { iniciarPing, pararPing } from "../lib/localizacao"
import { CORES_APP as CORES } from "../theme"

// Altura fixa exportada -- App.tsx usa isso pra dar padding-top no
// conteúdo e não deixar nada escondido atrás da barra.
const ALTURA_TOPBAR_PX = 52

function TopBar({ token, motoristaId }: { token: string; motoristaId: string }) {
  const [disponivel, setDisponivel] = useState(false)
  const [carregandoInicial, setCarregandoInicial] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const pingIdRef = useRef<number | null>(null)

  // Busca o estado real (persistido no backend) ao abrir o app --
  // antes disso o toggle sempre começava "Indisponível" mesmo que o
  // motorista tivesse deixado "Disponível" numa sessão anterior (ou
  // um gerente tivesse ativado numa tela gerencial futura).
  useEffect(() => {
    let cancelado = false
    buscarMinhaDisponibilidade(token, motoristaId)
      .then((valor) => {
        if (!cancelado && valor !== null) {
          setDisponivel(valor)
          if (valor) {
            pingIdRef.current = iniciarPing(token, motoristaId, () =>
              setErro("Falha ao enviar localização"),
            )
          }
        }
      })
      .catch(() => {
        // Sem sinal/erro de rede ao abrir -- fica no padrão
        // "Indisponível" local, motorista pode tentar o toggle manual
      })
      .finally(() => {
        if (!cancelado) setCarregandoInicial(false)
      })
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => {
      if (pingIdRef.current !== null) pararPing(pingIdRef.current)
    }
  }, [])

  async function alternar() {
    const novoValor = !disponivel
    setErro(null)
    try {
      await atualizarDisponibilidade(token, motoristaId, novoValor)
    } catch {
      setErro("Falha ao atualizar disponibilidade")
      return
    }

    if (novoValor) {
      pingIdRef.current = iniciarPing(token, motoristaId, () =>
        setErro("Falha ao enviar localização"),
      )
    } else if (pingIdRef.current !== null) {
      pararPing(pingIdRef.current)
      pingIdRef.current = null
    }
    setDisponivel(novoValor)
  }

  return (
    <div style={estilos.barra}>
      <span style={estilos.nome}>Gás Favero</span>
      <div style={estilos.direita}>
        {erro && <span style={estilos.erro}>{erro}</span>}
        <button
          style={estiloToggle(disponivel)}
          disabled={carregandoInicial}
          onClick={alternar}
        >
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
