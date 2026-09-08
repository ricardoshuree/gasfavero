// [mcp-local harness] feature: perfil-config-debug-gps | plano: fa7002dc | 2026-09-08 10:18:43
// ConfiguracoesTela: diagnóstico de GPS com lat/long, permissão, status de envio e botão para testar manualmente
// Tela de Configurações / Diagnóstico de GPS
// Mostra lat/long atual, status do último envio ao backend e botão para forçar envio.
// Propósito: validar visualmente que o GPS está funcionando e o ping está chegando no servidor.
import { useEffect, useRef, useState, type CSSProperties } from "react"
import { CORES_APP as C } from "../theme"
import { request } from "../lib/api"

const INTERVALO_GPS_MS = 15_000  // lê GPS a cada 15s na tela de debug

interface Props {
  token: string
  motoristaId: string
  onVoltar: () => void
}

type StatusEnvio = "aguardando" | "enviando" | "ok" | "erro"

function arredondar6(v: number) { return Math.round(v * 1e6) / 1e6 }

export default function ConfiguracoesTela({ token, motoristaId, onVoltar }: Props) {
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [precisao, setPrecisao] = useState<number | null>(null)
  const [ultimaLeitura, setUltimaLeitura] = useState<Date | null>(null)
  const [permissao, setPermissao] = useState<"desconhecida" | "concedida" | "negada">("desconhecida")
  const [erroGps, setErroGps] = useState("")
  const [statusEnvio, setStatusEnvio] = useState<StatusEnvio>("aguardando")
  const [ultimoEnvio, setUltimoEnvio] = useState<Date | null>(null)
  const [erroEnvio, setErroEnvio] = useState("")
  const [enviando, setEnviando] = useState(false)
  const intervalRef = useRef<number | null>(null)

  async function lerGps(): Promise<{ lat: number; lng: number; acc: number } | null> {
    return new Promise(resolve => {
      if (!navigator.geolocation) {
        setPermissao("negada")
        setErroGps("navigator.geolocation não disponível neste ambiente.")
        resolve(null); return
      }
      navigator.geolocation.getCurrentPosition(
        pos => {
          setPermissao("concedida")
          setErroGps("")
          resolve({
            lat: arredondar6(pos.coords.latitude),
            lng: arredondar6(pos.coords.longitude),
            acc: Math.round(pos.coords.accuracy),
          })
        },
        err => {
          if (err.code === 1) { setPermissao("negada"); setErroGps("Permissão de localização negada.") }
          else setErroGps(`Erro GPS: ${err.message}`)
          resolve(null)
        },
        { enableHighAccuracy: true, timeout: 10_000 }
      )
    })
  }

  async function atualizarGps() {
    const pos = await lerGps()
    if (pos) {
      setLat(pos.lat); setLng(pos.lng); setPrecisao(pos.acc)
      setUltimaLeitura(new Date())
    }
  }

  async function enviarParaBackend(latV: number, lngV: number) {
    setStatusEnvio("enviando"); setErroEnvio("")
    try {
      await request(`/api/v1/motoristas/${motoristaId}/localizacao`, {
        method: "PUT", token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: latV, longitude: lngV }),
      })
      setStatusEnvio("ok")
      setUltimoEnvio(new Date())
    } catch (e: any) {
      setStatusEnvio("erro")
      setErroEnvio(e.message ?? "Falha ao enviar para o backend.")
    }
  }

  async function testarCompleto() {
    setEnviando(true)
    const pos = await lerGps()
    if (pos) {
      setLat(pos.lat); setLng(pos.lng); setPrecisao(pos.acc)
      setUltimaLeitura(new Date())
      await enviarParaBackend(pos.lat, pos.lng)
    }
    setEnviando(false)
  }

  useEffect(() => {
    atualizarGps()
    intervalRef.current = window.setInterval(atualizarGps, INTERVALO_GPS_MS)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  function fmtHora(d: Date) {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  }

  const corPermissao = permissao === "concedida" ? "#3a5c1a" : permissao === "negada" ? "#dc2626" : "#92400e"
  const bgPermissao  = permissao === "concedida" ? "#f0f4eb" : permissao === "negada" ? "#fee2e2" : "#fef3c7"

  const iconeStatus = statusEnvio === "ok" ? "✓" : statusEnvio === "erro" ? "✗" : statusEnvio === "enviando" ? "⏳" : "—"
  const corStatus   = statusEnvio === "ok" ? "#3a5c1a" : statusEnvio === "erro" ? "#dc2626" : "#92400e"
  const bgStatus    = statusEnvio === "ok" ? "#f0f4eb" : statusEnvio === "erro" ? "#fee2e2" : "#fef3c7"

  return (
    <div style={s.pagina}>
      <div style={s.cabecalho}>
        <button style={s.btnVoltar} onClick={onVoltar}>←</button>
        <span style={s.titulo}>Configurações</span>
        <div style={{ width: 36 }} />
      </div>

      {/* Permissão */}
      <div style={s.secao}>
        <p style={s.secaoTitulo}>📍 Permissão de Localização</p>
        <div style={{ ...s.pill, background: bgPermissao, color: corPermissao }}>
          {permissao === "concedida" ? "✓ Concedida" : permissao === "negada" ? "✗ Negada" : "? Desconhecida"}
        </div>
        {permissao === "negada" && (
          <p style={s.aviso}>Acesse Configurações do Android → Apps → Gás Favero → Permissões → Localização e ative.</p>
        )}
      </div>

      {/* GPS atual */}
      <div style={s.secao}>
        <p style={s.secaoTitulo}>🛰 Posição GPS</p>
        {erroGps && <p style={s.erro}>{erroGps}</p>}
        {lat !== null ? (
          <>
            <div style={s.coordRow}>
              <span style={s.coordLabel}>Latitude</span>
              <span style={s.coordValor}>{lat}</span>
            </div>
            <div style={s.coordRow}>
              <span style={s.coordLabel}>Longitude</span>
              <span style={s.coordValor}>{lng}</span>
            </div>
            <div style={s.coordRow}>
              <span style={s.coordLabel}>Precisão</span>
              <span style={s.coordValor}>±{precisao}m</span>
            </div>
            <div style={s.coordRow}>
              <span style={s.coordLabel}>Lido às</span>
              <span style={s.coordValor}>{ultimaLeitura ? fmtHora(ultimaLeitura) : "—"}</span>
            </div>
          </>
        ) : (
          <p style={s.info}>Aguardando GPS{erroGps ? "" : "..."}  (atualiza a cada 15s)</p>
        )}
      </div>

      {/* Status do envio */}
      <div style={s.secao}>
        <p style={s.secaoTitulo}>📡 Envio para o Backend</p>
        <div style={s.statusRow}>
          <div style={{ ...s.pill, background: bgStatus, color: corStatus }}>
            {iconeStatus} {statusEnvio === "ok" ? "Enviado com sucesso" : statusEnvio === "erro" ? "Erro no envio" : statusEnvio === "enviando" ? "Enviando..." : "Não testado"}
          </div>
          {ultimoEnvio && <span style={s.horaEnvio}>às {fmtHora(ultimoEnvio)}</span>}
        </div>
        {erroEnvio && <p style={s.erro}>{erroEnvio}</p>}
        <p style={s.dica}>
          Após clicar em "Testar envio", abra o Mapa no sistema web e verifique se o caminhão do Ricardo aparece.
        </p>
      </div>

      {/* Botão de teste */}
      <button
        style={{ ...s.btnTestar, opacity: enviando ? 0.6 : 1 }}
        disabled={enviando}
        onClick={testarCompleto}
      >
        {enviando ? "⏳ Testando..." : "🔄 Testar envio agora"}
      </button>

      <p style={s.rodapeInfo}>
        A localização é enviada automaticamente a cada 20s quando o toggle "Disponível" está ativo na barra superior.
      </p>
    </div>
  )
}

const s: Record<string, CSSProperties> = {
  pagina:      { padding: "0 0 80px" },
  cabecalho:   { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px 8px", background: "#fff", borderBottom: "1px solid #F3F4F6" },
  btnVoltar:   { background: "transparent", border: "none", color: "#606C38", fontSize: "20px", fontWeight: 700, cursor: "pointer", padding: "2px 6px", width: 36 },
  titulo:      { fontSize: "15px", fontWeight: 700, color: C.texto },
  secao:       { margin: "12px 14px 0", background: "#fff", border: `1px solid ${C.borda}`, borderRadius: "12px", padding: "12px 14px" },
  secaoTitulo: { fontSize: "11px", fontWeight: 700, color: C.textoSecundario, textTransform: "uppercase" as const, letterSpacing: "0.5px", margin: "0 0 8px" },
  pill:        { display: "inline-block", fontSize: "13px", fontWeight: 600, padding: "4px 12px", borderRadius: "20px", marginBottom: "6px" },
  aviso:       { fontSize: "12px", color: "#dc2626", margin: "6px 0 0", lineHeight: "1.5" },
  erro:        { fontSize: "12px", color: "#dc2626", margin: "4px 0" },
  info:        { fontSize: "13px", color: C.textoSecundario, margin: "4px 0" },
  coordRow:    { display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `0.5px solid ${C.borda}`, fontSize: "13px" },
  coordLabel:  { color: C.textoSecundario },
  coordValor:  { fontWeight: 700, color: C.texto, fontFamily: "monospace" },
  statusRow:   { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" as const },
  horaEnvio:   { fontSize: "12px", color: C.textoSecundario },
  dica:        { fontSize: "12px", color: C.textoSecundario, marginTop: "8px", lineHeight: "1.5" },
  btnTestar: {
    display: "block", width: "calc(100% - 28px)", margin: "14px auto 0",
    background: "#606C38", color: "#F8FAFC", border: "none",
    borderRadius: "12px", padding: "14px", fontSize: "15px",
    fontWeight: 600, cursor: "pointer", textAlign: "center" as const,
  },
  rodapeInfo:  { fontSize: "11px", color: C.textoSecundario, textAlign: "center" as const, margin: "12px 14px 0", lineHeight: "1.5" },
}
