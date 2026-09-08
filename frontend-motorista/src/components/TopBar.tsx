// [mcp-local harness] feature: foreground-service-localizacao | plano: 973c2472 | 2026-09-08 12:08:30
// TopBar: usa AndroidLocalizacao (Foreground Service nativo) com fallback para ping JS
// TopBar — barra superior fixa do app motorista
// Localização: usa Foreground Service nativo (AndroidLocalizacao) no Android.
// Fallback para ping JS quando fora do ambiente nativo (ex: browser dev).
import { type CSSProperties, useEffect, useRef, useState } from "react"
import { atualizarDisponibilidade, buscarMinhaDisponibilidade } from "../lib/disponibilidade"
import { iniciarPing, pararPing } from "../lib/localizacao"
import { CORES_APP as CORES } from "../theme"

const ALTURA_TOPBAR_PX = 52
const INTERVALO_POLLING_MS = 15_000

// Ponte nativa — exposta pela MainActivity via addJavascriptInterface
type JanelaAndroid = Window & {
  AndroidLocalizacao?: {
    ligar: (token: string, motoristaId: string) => void
    desligar: () => void
  }
  AndroidFCM?: { sincronizar?: () => void }
}

/** Liga o rastreamento: usa Foreground Service nativo se disponível, senão JS */
function ligarRastreamento(
  token: string,
  motoristaId: string,
  aoErroJs: () => void,
  pingIdRef: React.MutableRefObject<number | null>
) {
  const ponte = (window as JanelaAndroid).AndroidLocalizacao
  if (ponte?.ligar) {
    ponte.ligar(token, motoristaId)
  } else {
    // Fallback: ping JS (funciona no browser de dev)
    pingIdRef.current = iniciarPing(token, motoristaId, aoErroJs)
  }
}

/** Desliga o rastreamento */
function desligarRastreamento(pingIdRef: React.MutableRefObject<number | null>) {
  const ponte = (window as JanelaAndroid).AndroidLocalizacao
  if (ponte?.desligar) {
    ponte.desligar()
  } else if (pingIdRef.current !== null) {
    pararPing(pingIdRef.current)
    pingIdRef.current = null
  }
}

function TopBar({
  token,
  motoristaId,
  nomeMotorista,
}: {
  token: string
  motoristaId: string
  nomeMotorista?: string
}) {
  const [disponivel, setDisponivel] = useState(false)
  const [carregandoInicial, setCarregandoInicial] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const pingIdRef = useRef<number | null>(null)

  function aoErroLocalizacao() {
    setErro("Falha ao enviar localização")
  }

  // Carrega disponibilidade inicial e liga rastreamento se já estava ativo
  useEffect(() => {
    let cancelado = false
    buscarMinhaDisponibilidade(token, motoristaId)
      .then((valor) => {
        if (!cancelado && valor !== null) {
          setDisponivel(valor)
          if (valor) ligarRastreamento(token, motoristaId, aoErroLocalizacao, pingIdRef)
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelado) setCarregandoInicial(false) })
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Polling de disponibilidade (sincroniza mudanças feitas de outro dispositivo)
  useEffect(() => {
    if (carregandoInicial) return
    let cancelado = false
    const intervalo = setInterval(() => {
      buscarMinhaDisponibilidade(token, motoristaId)
        .then((valor) => {
          if (cancelado || valor === null) return
          setDisponivel((atual) => {
            if (valor === atual) return atual
            if (valor) {
              ligarRastreamento(token, motoristaId, aoErroLocalizacao, pingIdRef)
            } else {
              desligarRastreamento(pingIdRef)
            }
            return valor
          })
        })
        .catch(() => {})
    }, INTERVALO_POLLING_MS)
    return () => { cancelado = true; clearInterval(intervalo) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregandoInicial, token, motoristaId])

  // Garante que o serviço para ao desmontar
  useEffect(() => {
    return () => { desligarRastreamento(pingIdRef) }
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
      ligarRastreamento(token, motoristaId, aoErroLocalizacao, pingIdRef)
    } else {
      desligarRastreamento(pingIdRef)
    }
    setDisponivel(novoValor)
  }

  const primeiroNome = nomeMotorista ? nomeMotorista.split(" ")[0] : "Motorista"

  return (
    <div style={estilos.barra}>
      <span style={estilos.nome}>{primeiroNome}</span>
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
    display: "flex", alignItems: "center", gap: "0.35rem",
    padding: "0.35rem 0.7rem", borderRadius: "999px",
    border: `1px solid ${ativo ? CORES.statusOn : CORES.borda}`,
    background: ativo ? "rgba(34,197,94,0.1)" : CORES.fundoCard,
    color: CORES.texto, fontSize: "0.75rem", fontWeight: 700,
  }
}

function estiloPontinho(ativo: boolean): CSSProperties {
  return { width: 8, height: 8, borderRadius: "50%", background: ativo ? CORES.statusOn : CORES.statusOff }
}

const estilos: Record<string, CSSProperties> = {
  barra: {
    position: "fixed", top: 0, left: 0, right: 0,
    height: ALTURA_TOPBAR_PX, display: "flex", alignItems: "center",
    justifyContent: "space-between", padding: "0 0.75rem",
    paddingTop: "env(safe-area-inset-top)",
    background: CORES.fundo, borderBottom: `1px solid ${CORES.borda}`,
    zIndex: 10, boxSizing: "border-box",
  },
  nome:   { fontWeight: 700, fontSize: "0.95rem", color: CORES.texto },
  direita:{ display: "flex", alignItems: "center", gap: "0.5rem" },
  erro:   { fontSize: "0.7rem", color: CORES.erro },
}

export default TopBar
export { ALTURA_TOPBAR_PX }
