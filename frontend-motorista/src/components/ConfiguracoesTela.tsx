// [mcp-local harness] feature: configuracoes-btn-voltar-padrao | plano: 8356d430 | 2026-09-08 15:15:04
// Botão voltar no padrão iFood — bolinha cinza com ‹
// ConfiguracoesTela: dois blocos na tela principal (Localização + Alerta de Chamado).
// Cada bloco abre um sheet de baixo para cima com seus detalhes.
import { useEffect, useRef, useState, type CSSProperties } from "react"
import { CORES_APP as C } from "../theme"
import { request } from "../lib/api"
import { CHAVE_SOM, SOM_PADRAO, SONS_DISPONIVEIS, previewSom } from "../lib/alarme"

const INTERVALO_GPS_MS = 15_000

interface Props {
  token: string
  motoristaId: string
  onVoltar: () => void
}

type StatusEnvio = "aguardando" | "enviando" | "ok" | "erro"
type SheetAberto = "nenhum" | "localizacao" | "alerta"

function arredondar6(v: number) { return Math.round(v * 1e6) / 1e6 }

export default function ConfiguracoesTela({ token, motoristaId, onVoltar }: Props) {
  // --- GPS / Localização ---
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

  // --- Alerta de Chamado ---
  const [somSelecionado, setSomSelecionado] = useState<string>(
    () => localStorage.getItem(CHAVE_SOM) ?? SOM_PADRAO
  )
  const [somTemp, setSomTemp] = useState<string>(somSelecionado)

  // --- Sheet ---
  const [sheetAberto, setSheetAberto] = useState<SheetAberto>("nenhum")

  function abrirSheet(sheet: SheetAberto) {
    if (sheet === "alerta") setSomTemp(somSelecionado)
    setSheetAberto(sheet)
  }

  function fecharSheet() { setSheetAberto("nenhum") }

  // --- GPS helpers ---
  async function lerGps(): Promise<{ lat: number; lng: number; acc: number } | null> {
    return new Promise(resolve => {
      if (!navigator.geolocation) {
        setPermissao("negada"); setErroGps("navigator.geolocation não disponível.")
        resolve(null); return
      }
      navigator.geolocation.getCurrentPosition(
        pos => {
          setPermissao("concedida"); setErroGps("")
          resolve({ lat: arredondar6(pos.coords.latitude), lng: arredondar6(pos.coords.longitude), acc: Math.round(pos.coords.accuracy) })
        },
        err => {
          if (err.code === 1) { setPermissao("negada"); setErroGps("Permissão negada.") }
          else setErroGps(`Erro GPS: ${err.message}`)
          resolve(null)
        },
        { enableHighAccuracy: true, timeout: 10_000 }
      )
    })
  }

  async function atualizarGps() {
    const pos = await lerGps()
    if (pos) { setLat(pos.lat); setLng(pos.lng); setPrecisao(pos.acc); setUltimaLeitura(new Date()) }
  }

  async function enviarParaBackend(latV: number, lngV: number) {
    setStatusEnvio("enviando"); setErroEnvio("")
    try {
      await request(`/api/v1/motoristas/${motoristaId}/localizacao`, {
        method: "PUT", token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: latV, longitude: lngV }),
      })
      setStatusEnvio("ok"); setUltimoEnvio(new Date())
    } catch (e: any) {
      setStatusEnvio("erro"); setErroEnvio(e.message ?? "Falha ao enviar.")
    }
  }

  async function testarCompleto() {
    setEnviando(true)
    const pos = await lerGps()
    if (pos) { setLat(pos.lat); setLng(pos.lng); setPrecisao(pos.acc); setUltimaLeitura(new Date()); await enviarParaBackend(pos.lat, pos.lng) }
    setEnviando(false)
  }

  useEffect(() => {
    atualizarGps()
    intervalRef.current = window.setInterval(atualizarGps, INTERVALO_GPS_MS)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  function fmtHora(d: Date) { return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) }

  // --- Cores dinâmicas ---
  const corPerm = permissao === "concedida" ? "#3a5c1a" : permissao === "negada" ? "#dc2626" : "#92400e"
  const bgPerm  = permissao === "concedida" ? "#f0f4eb" : permissao === "negada" ? "#fee2e2" : "#fef3c7"
  const iconeStatus = statusEnvio === "ok" ? "✓" : statusEnvio === "erro" ? "✗" : statusEnvio === "enviando" ? "⏳" : "—"
  const corStatus   = statusEnvio === "ok" ? "#3a5c1a" : statusEnvio === "erro" ? "#dc2626" : "#92400e"
  const bgStatus    = statusEnvio === "ok" ? "#f0f4eb" : statusEnvio === "erro" ? "#fee2e2" : "#fef3c7"

  const nomeSomAtivo = SONS_DISPONIVEIS.find(s => s.arquivo === somSelecionado)?.label ?? "Padrão"

  function salvarSom() {
    localStorage.setItem(CHAVE_SOM, somTemp)
    setSomSelecionado(somTemp)
    fecharSheet()
  }

  return (
    <div style={s.pagina}>
      {/* Cabeçalho — padrão iFood: bolinha cinza com ‹ */}
      <div style={s.cabecalho}>
        <button style={s.btnVoltar} onClick={onVoltar}>
          <span style={{ fontSize: 22, lineHeight: 1, color: "#374151" }}>‹</span>
        </button>
        <span style={s.titulo}>Configurações</span>
        <div style={{ width: 36 }} />
      </div>

      {/* Bloco — Permissão de Localização */}
      <div style={s.bloco} onClick={() => abrirSheet("localizacao")}>
        <div style={s.blocoEsq}>
          <span style={s.blocoIcone}>📍</span>
          <div>
            <p style={s.blocoLabel}>Permissão de Localização</p>
            <div style={{ ...s.pill, background: bgPerm, color: corPerm }}>
              {permissao === "concedida" ? "✓ Concedida" : permissao === "negada" ? "✗ Negada" : "? Verificando..."}
            </div>
          </div>
        </div>
        <span style={s.chevron}>›</span>
      </div>

      {/* Bloco — Alerta de Chamado */}
      <div style={s.bloco} onClick={() => abrirSheet("alerta")}>
        <div style={s.blocoEsq}>
          <span style={s.blocoIcone}>🔈</span>
          <div>
            <p style={s.blocoLabel}>Alerta de Chamado</p>
            <p style={s.blocoSub}>{nomeSomAtivo}</p>
          </div>
        </div>
        <span style={s.chevron}>›</span>
      </div>

      {/* Overlay compartilhado */}
      {sheetAberto !== "nenhum" && (
        <div style={s.overlay} onClick={fecharSheet}>
          <div style={s.sheet} onClick={e => e.stopPropagation()}>
            <div style={s.handle} />

            {/* === Sheet: Localização === */}
            {sheetAberto === "localizacao" && (
              <>
                <p style={s.sheetTitulo}>Localização GPS</p>

                <div style={s.secao}>
                  <p style={s.secaoTitulo}>📍 Permissão</p>
                  <div style={{ ...s.pill, background: bgPerm, color: corPerm }}>
                    {permissao === "concedida" ? "✓ Concedida" : permissao === "negada" ? "✗ Negada" : "? Verificando..."}
                  </div>
                  {permissao === "negada" && <p style={s.aviso}>Acesse Configurações do Android → Apps → Gás Favero → Permissões → Localização.</p>}
                </div>

                <div style={s.secao}>
                  <p style={s.secaoTitulo}>🛰 Posição GPS</p>
                  {erroGps && <p style={s.erro}>{erroGps}</p>}
                  {lat !== null ? (
                    <>
                      <div style={s.coordRow}><span style={s.coordLabel}>Latitude</span><span style={s.coordValor}>{lat}</span></div>
                      <div style={s.coordRow}><span style={s.coordLabel}>Longitude</span><span style={s.coordValor}>{lng}</span></div>
                      <div style={s.coordRow}><span style={s.coordLabel}>Precisão</span><span style={s.coordValor}>±{precisao}m</span></div>
                      <div style={s.coordRow}><span style={s.coordLabel}>Lido às</span><span style={s.coordValor}>{ultimaLeitura ? fmtHora(ultimaLeitura) : "—"}</span></div>
                    </>
                  ) : (
                    <p style={s.info}>Aguardando GPS{erroGps ? "" : "..."}</p>
                  )}
                </div>

                <div style={s.secao}>
                  <p style={s.secaoTitulo}>📡 Envio para o Backend</p>
                  <div style={s.statusRow}>
                    <div style={{ ...s.pill, background: bgStatus, color: corStatus }}>
                      {iconeStatus} {statusEnvio === "ok" ? "Enviado" : statusEnvio === "erro" ? "Erro" : statusEnvio === "enviando" ? "Enviando..." : "Não testado"}
                    </div>
                    {ultimoEnvio && <span style={s.horaEnvio}>às {fmtHora(ultimoEnvio)}</span>}
                  </div>
                  {erroEnvio && <p style={s.erro}>{erroEnvio}</p>}
                  <p style={s.dica}>Após testar, abra o Mapa no sistema web e verifique se o caminhão aparece.</p>
                </div>

                <button style={{ ...s.btnSalvar, opacity: enviando ? 0.6 : 1 }} disabled={enviando} onClick={testarCompleto}>
                  {enviando ? "⏳ Testando..." : "🔄 Testar envio agora"}
                </button>
                <button style={s.btnFechar} onClick={fecharSheet}>Fechar</button>
              </>
            )}

            {/* === Sheet: Alerta de Chamado === */}
            {sheetAberto === "alerta" && (
              <>
                <p style={s.sheetTitulo}>Alerta de Chamado</p>
                <p style={s.sheetSub}>Escolha o som que tocará ao receber um chamado.</p>

                <div style={s.listaSons}>
                  {SONS_DISPONIVEIS.map(som => (
                    <div
                      key={som.arquivo}
                      style={{ ...s.itemSom, borderColor: somTemp === som.arquivo ? "#606C38" : C.borda }}
                      onClick={() => setSomTemp(som.arquivo)}
                    >
                      <div style={s.itemSomEsq}>
                        <div style={s.radio}>
                          {somTemp === som.arquivo && <div style={s.radioDot} />}
                        </div>
                        <span style={{ ...s.itemSomLabel, fontWeight: somTemp === som.arquivo ? 700 : 400 }}>
                          {som.label}
                        </span>
                      </div>
                      <button
                        style={s.btnPlay}
                        onClick={e => { e.stopPropagation(); previewSom(som.arquivo) }}
                      >
                        ▶
                      </button>
                    </div>
                  ))}
                </div>

                <button style={s.btnSalvar} onClick={salvarSom}>Salvar</button>
                <button style={s.btnFechar} onClick={fecharSheet}>Fechar</button>
              </>
            )}

            <div style={{ height: "calc(env(safe-area-inset-bottom) + 8px)" }} />
          </div>
        </div>
      )}
    </div>
  )
}

const s: Record<string, CSSProperties> = {
  pagina:    { padding: "0 0 80px", background: "#F9FAFB", minHeight: "100vh" },
  cabecalho: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px 8px", background: "#fff", borderBottom: "1px solid #F3F4F6" },
  btnVoltar: {
    width: 36, height: 36, borderRadius: "50%", background: "#F3F4F6",
    border: "none", display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", padding: 0,
  },
  titulo:    { fontSize: "15px", fontWeight: 700, color: C.texto },

  bloco:     { display: "flex", alignItems: "center", justifyContent: "space-between", margin: "16px 14px 0", background: "#fff", border: `1px solid ${C.borda}`, borderRadius: "12px", padding: "14px 16px", cursor: "pointer" },
  blocoEsq:  { display: "flex", alignItems: "center", gap: "12px" },
  blocoIcone:{ fontSize: "22px", lineHeight: "1" },
  blocoLabel:{ fontSize: "14px", fontWeight: 600, color: C.texto, margin: "0 0 4px" },
  blocoSub:  { fontSize: "12px", color: C.textoSecundario, margin: 0 },
  chevron:   { fontSize: "22px", color: "#9CA3AF", fontWeight: 300 },
  pill:      { display: "inline-block", fontSize: "12px", fontWeight: 600, padding: "3px 10px", borderRadius: "20px" },

  overlay:   { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end", zIndex: 1000 },
  sheet:     { background: "#fff", width: "100%", borderRadius: "20px 20px 0 0", padding: "0", maxHeight: "88vh", overflowY: "auto" as const },
  handle:    { width: 40, height: 4, background: "#D1D5DB", borderRadius: 2, margin: "12px auto 4px" },

  sheetTitulo: { fontSize: "16px", fontWeight: 700, color: C.texto, textAlign: "center" as const, margin: "8px 0 2px" },
  sheetSub:    { fontSize: "13px", color: C.textoSecundario, textAlign: "center" as const, margin: "0 14px 12px" },

  secao:      { margin: "0 14px 12px", background: "#F9FAFB", border: `1px solid ${C.borda}`, borderRadius: "12px", padding: "12px 14px" },
  secaoTitulo:{ fontSize: "11px", fontWeight: 700, color: C.textoSecundario, textTransform: "uppercase" as const, letterSpacing: "0.5px", margin: "0 0 8px" },
  aviso:      { fontSize: "12px", color: "#dc2626", margin: "6px 0 0", lineHeight: "1.5" },
  erro:       { fontSize: "12px", color: "#dc2626", margin: "4px 0" },
  info:       { fontSize: "13px", color: C.textoSecundario, margin: "4px 0" },
  coordRow:   { display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `0.5px solid ${C.borda}`, fontSize: "13px" },
  coordLabel: { color: C.textoSecundario },
  coordValor: { fontWeight: 700, color: C.texto, fontFamily: "monospace" },
  statusRow:  { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" as const },
  horaEnvio:  { fontSize: "12px", color: C.textoSecundario },
  dica:       { fontSize: "12px", color: C.textoSecundario, marginTop: "8px", lineHeight: "1.5" },

  listaSons:    { margin: "0 14px 12px", display: "flex", flexDirection: "column" as const, gap: "8px" },
  itemSom:      { display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", border: "2px solid", borderRadius: "12px", padding: "12px 14px", cursor: "pointer" },
  itemSomEsq:   { display: "flex", alignItems: "center", gap: "12px" },
  itemSomLabel: { fontSize: "14px", color: C.texto },
  radio:        { width: 20, height: 20, borderRadius: "50%", border: "2px solid #606C38", display: "flex", alignItems: "center", justifyContent: "center" },
  radioDot:     { width: 10, height: 10, borderRadius: "50%", background: "#606C38" },
  btnPlay:      { background: "#F3F4F6", border: "none", borderRadius: "50%", width: 36, height: 36, fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },

  btnSalvar: { display: "block", width: "calc(100% - 28px)", margin: "4px auto 10px", background: "#606C38", color: "#F8FAFC", border: "none", borderRadius: "12px", padding: "14px", fontSize: "15px", fontWeight: 600, cursor: "pointer", textAlign: "center" as const },
  btnFechar: { display: "block", width: "calc(100% - 28px)", margin: "0 auto 12px", background: "#fff", color: "#EA1D2C", border: "2px solid #EA1D2C", borderRadius: "12px", padding: "13px", fontSize: "15px", fontWeight: 700, cursor: "pointer", textAlign: "center" as const },
}
