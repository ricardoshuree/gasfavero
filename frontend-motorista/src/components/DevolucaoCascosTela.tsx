// [mcp-local harness] feature: malote-retorno-cascos-busca | plano: 51e5d554 | 2026-09-08 12:44:34
// DevolucaoCascosTela: campo de busca por nome do cliente filtrado localmente
// DevolucaoCascosTela — busca local por nome do cliente adicionada
// Toggle: somente meus (padrão) / todos os motoristas
// Busca filtra os cascos já carregados por cliente_nome
import { useEffect, useState, type CSSProperties } from "react"
import { CORES_APP as C } from "../theme"
import type { UserMe } from "../lib/auth"
import {
  buscarCascosEmAberto, corStatus, labelDias, labelStatus,
  registrarRecebimentoCasco, type Casco,
} from "../lib/cascos"

function formatData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR")
}

interface Props { token: string; usuario: UserMe }

function DevolucaoSheet({
  casco, token, onFechar, onSucesso,
}: {
  casco: Casco; token: string
  onFechar: () => void; onSucesso: (atualizado: Casco) => void
}) {
  const [observacao, setObservacao] = useState("")
  const [confirmando, setConfirmando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState("")
  const jaRecebido = casco.status === "recebido_aguardando"

  async function handleRegistrar() {
    setSalvando(true); setErro("")
    try {
      const atualizado = await registrarRecebimentoCasco(token, casco.id, observacao || undefined)
      onSucesso(atualizado)
    } catch (e: any) { setErro(e.message ?? "Erro ao registrar devolução.") }
    finally { setSalvando(false) }
  }

  return (
    <div style={ss.overlay} onClick={onFechar}>
      <div style={ss.sheet} onClick={e => e.stopPropagation()}>
        <div style={ss.handle} />
        {!confirmando && (
          <>
            <p style={ss.titulo}>{casco.cliente_nome}</p>
            <div style={ss.linhas}>
              <div style={ss.linha}><span style={ss.lL}>Produto</span><span style={ss.lV}>{casco.quantidade}× {casco.produto_nome}</span></div>
              <div style={ss.linha}><span style={ss.lL}>Motorista</span><span style={ss.lV}>{casco.motorista_nome ?? "—"}</span></div>
              <div style={ss.linha}><span style={ss.lL}>Emprestado em</span><span style={ss.lV}>{formatData(casco.created_at)}</span></div>
              <div style={ss.linha}>
                <span style={ss.lL}>Em aberto há</span>
                <span style={{ ...ss.lV, color: casco.dias_em_aberto >= 14 ? "#dc2626" : "#92400e", fontWeight: 700 }}>
                  {labelDias(casco.dias_em_aberto)}
                </span>
              </div>
              {jaRecebido && casco.recebido_por_nome && (
                <div style={ss.linha}><span style={ss.lL}>Recebido por</span><span style={ss.lV}>{casco.recebido_por_nome}</span></div>
              )}
              <div style={{ ...ss.linha, borderBottom: "none" }}>
                <span style={ss.lL}>Status</span>
                <span style={{ ...ss.lV, background: corStatus(casco.status).bg, color: corStatus(casco.status).text, padding: "2px 8px", borderRadius: "8px", fontSize: "11px", fontWeight: 600 }}>
                  {labelStatus(casco.status)}
                </span>
              </div>
            </div>
            {jaRecebido
              ? <div style={ss.avisoAzul}>✓ Devolução registrada. Aguardando confirmação do gerente no sistema web.</div>
              : <button style={ss.btnRegistrar} onClick={() => setConfirmando(true)}>🔄 Registrar devolução física</button>
            }
            <button style={ss.btnFechar} onClick={onFechar}>Fechar</button>
          </>
        )}
        {confirmando && (
          <>
            <p style={ss.titulo}>Confirmar devolução</p>
            <div style={ss.avisoAmarelo}>
              Você está confirmando que recebeu fisicamente <strong>{casco.quantidade}× {casco.produto_nome}</strong> do cliente <strong>{casco.cliente_nome}</strong>. O gerente fará a baixa formal no sistema web.
            </div>
            <div style={ss.campo}>
              <label style={ss.campoLabel}>Observação (opcional)</label>
              <input style={ss.campoInput} placeholder="Ex: botijão com amassado..." value={observacao} onChange={e => setObservacao(e.target.value)} />
            </div>
            {erro && <p style={ss.erro}>{erro}</p>}
            <div style={ss.acoes}>
              <button style={ss.btnVoltar} onClick={() => { setConfirmando(false); setErro("") }} disabled={salvando}>← Voltar</button>
              <button style={ss.btnConfirmar} onClick={handleRegistrar} disabled={salvando}>
                {salvando ? "Registrando..." : "✓ Confirmar devolução"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function CardCasco({ casco, onTap }: { casco: Casco; onTap: () => void }) {
  const { bg, text } = corStatus(casco.status)
  const urgente = casco.status === "emprestado" && casco.dias_em_aberto >= 14
  return (
    <div style={{ ...s.card, borderColor: urgente ? "#fca5a5" : "#e5e7eb", borderWidth: urgente ? "1.5px" : "1px" }} onClick={onTap}>
      <div style={s.cardRow1}>
        <div style={{ flex: 1 }}>
          <div style={s.cardNome}>{casco.cliente_nome}</div>
          <div style={s.cardSub}>
            {casco.quantidade}× {casco.produto_nome}
            {casco.motorista_nome && casco.status === "emprestado" ? ` · ${casco.motorista_nome}` : ""}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: "8px" }}>
          <span style={{ ...s.badge, background: bg, color: text }}>{labelStatus(casco.status)}</span>
          <div style={{ fontSize: "12px", fontWeight: 600, color: casco.dias_em_aberto >= 14 ? "#dc2626" : "#92400e", marginTop: "4px" }}>
            {labelDias(casco.dias_em_aberto)}
          </div>
        </div>
      </div>
      <div style={s.cardRodape}>
        <span style={s.cardData}>Emprestado em {formatData(casco.created_at)}</span>
        <span style={s.cardSeta}>›</span>
      </div>
    </div>
  )
}

export default function DevolucaoCascosTela({ token, usuario }: Props) {
  const [todos, setTodos] = useState<Casco[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState("")
  const [verTodos, setVerTodos] = useState(false)
  const [selecionado, setSelecionado] = useState<Casco | null>(null)
  const [busca, setBusca] = useState("")

  async function carregar(filtrarTodos: boolean) {
    setCarregando(true); setErro("")
    try {
      const motorista_id = filtrarTodos ? undefined : usuario.id
      const res = await buscarCascosEmAberto(token, motorista_id)
      setTodos(res.data)
    } catch { setErro("Não foi possível carregar os cascos em aberto.") }
    finally { setCarregando(false) }
  }

  useEffect(() => { carregar(verTodos) }, [verTodos])

  function handleSucesso(atualizado: Casco) {
    setTodos(prev => prev.map(c => c.id === atualizado.id ? atualizado : c))
    setSelecionado(null)
  }

  // Filtra localmente por nome do cliente
  const filtrados = busca.trim().length >= 2
    ? todos.filter(c => c.cliente_nome.toLowerCase().includes(busca.trim().toLowerCase()))
    : todos

  const emprestados = filtrados.filter(c => c.status === "emprestado")
  const aguardando  = filtrados.filter(c => c.status === "recebido_aguardando")
  const totalCascos = todos.reduce((acc, c) => acc + c.quantidade, 0)

  return (
    <div style={s.pagina}>
      <div style={s.topo}>
        <div style={s.toggleRow}>
          <div style={s.toggleWrap} onClick={() => { setVerTodos(p => !p); setBusca("") }}>
            <div style={{ ...s.toggle, background: verTodos ? "#606C38" : "#e5e7eb" }}>
              <div style={{ ...s.toggleDot, left: verTodos ? "19px" : "3px" }} />
            </div>
            <span style={s.toggleLabel}>{verTodos ? "Todos os motoristas" : "Somente meus"}</span>
          </div>
          <span style={s.resumoBadge}>{totalCascos} casco{totalCascos !== 1 ? "s" : ""}</span>
        </div>

        {/* Campo de busca por nome do cliente */}
        <div style={s.searchBox}>
          <span style={s.searchIcon}>🔍</span>
          <input
            style={s.searchInput}
            placeholder="Buscar por nome ou CPF..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
          {busca && <button style={s.clearBtn} onClick={() => setBusca("")}>✕</button>}
        </div>
      </div>

      {carregando && <p style={s.info}>Carregando cascos...</p>}
      {erro && <p style={s.erroCentral}>{erro}</p>}

      {!carregando && filtrados.length === 0 && (
        <div style={s.vazio}>
          <p style={s.vazioEmoji}>{busca ? "🔎" : "✅"}</p>
          <p style={s.vazioTitulo}>{busca ? "Nenhum resultado" : "Nenhum casco em aberto"}</p>
          <p style={s.vazioSub}>
            {busca ? `Nenhum casco encontrado para "${busca}".` : verTodos ? "Nenhum botijão emprestado no momento." : "Todos os seus botijões foram devolvidos."}
          </p>
        </div>
      )}

      {emprestados.length > 0 && (
        <div style={s.grupo}>
          <div style={s.grupoTitulo}>⏳ Aguardando devolução ({emprestados.length})</div>
          {emprestados.map(c => <CardCasco key={c.id} casco={c} onTap={() => setSelecionado(c)} />)}
        </div>
      )}

      {aguardando.length > 0 && (
        <div style={s.grupo}>
          <div style={s.grupoTitulo}>🔵 Recebido — aguarda gerente ({aguardando.length})</div>
          {aguardando.map(c => <CardCasco key={c.id} casco={c} onTap={() => setSelecionado(c)} />)}
        </div>
      )}

      {selecionado && (
        <DevolucaoSheet casco={selecionado} token={token}
          onFechar={() => setSelecionado(null)} onSucesso={handleSucesso} />
      )}
    </div>
  )
}

const s: Record<string, CSSProperties> = {
  pagina:      { background: C.fundo, minHeight: "100%", paddingBottom: "80px" },
  topo:        { padding: "10px 14px 0" },
  toggleRow:   { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" },
  toggleWrap:  { display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", userSelect: "none" as const },
  toggle:      { width: "36px", height: "20px", borderRadius: "10px", position: "relative" as const, flexShrink: 0, transition: "background .2s" },
  toggleDot:   { position: "absolute" as const, top: "3px", width: "14px", height: "14px", borderRadius: "50%", background: "#fff", transition: "left .2s" },
  toggleLabel: { fontSize: "13px", color: C.texto, fontWeight: 500 },
  resumoBadge: { fontSize: "14px", fontWeight: 700, color: "#92400e" },
  searchBox:   { display: "flex", alignItems: "center", gap: "8px", background: C.fundoCard, border: `1px solid ${C.borda}`, borderRadius: "10px", padding: "9px 12px", marginBottom: "10px" },
  searchIcon:  { fontSize: "15px" },
  searchInput: { border: "none", background: "transparent", fontSize: "14px", color: C.texto, flex: 1, outline: "none" },
  clearBtn:    { background: "none", border: "none", fontSize: "14px", color: C.textoSecundario, cursor: "pointer", padding: 0 },
  info:        { textAlign: "center" as const, color: C.textoSecundario, fontSize: "14px", padding: "2rem" },
  erroCentral: { color: C.erro, fontSize: "13px", textAlign: "center" as const, padding: "0.5rem 1rem" },
  vazio:       { padding: "3rem 1rem", textAlign: "center" as const },
  vazioEmoji:  { fontSize: "36px", margin: "0 0 8px" },
  vazioTitulo: { fontSize: "15px", fontWeight: 600, color: C.texto, margin: "0 0 4px" },
  vazioSub:    { fontSize: "13px", color: C.textoSecundario, margin: 0 },
  grupo:       { padding: "0 14px", marginTop: "8px" },
  grupoTitulo: { fontSize: "11px", fontWeight: 700, color: C.textoSecundario, textTransform: "uppercase" as const, letterSpacing: "0.6px", marginBottom: "8px", marginTop: "10px" },
  card:        { background: "#fff", borderStyle: "solid" as const, borderRadius: "12px", padding: "11px 13px", marginBottom: "8px", cursor: "pointer" },
  cardRow1:    { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" },
  cardNome:    { fontSize: "14px", fontWeight: 700, color: C.texto },
  cardSub:     { fontSize: "11px", color: C.textoSecundario, marginTop: "2px" },
  badge:       { fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "8px" },
  cardRodape:  { display: "flex", justifyContent: "space-between", alignItems: "center" },
  cardData:    { fontSize: "11px", color: C.textoSecundario },
  cardSeta:    { fontSize: "18px", color: C.textoSecundario },
}

const ss: Record<string, CSSProperties> = {
  overlay:      { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", zIndex: 100 },
  sheet:        { background: "#fff", borderRadius: "16px 16px 0 0", padding: "16px", width: "100%", boxSizing: "border-box" as const, maxHeight: "90vh", overflowY: "auto" as const },
  handle:       { width: "36px", height: "4px", background: C.borda, borderRadius: "2px", margin: "0 auto 12px" },
  titulo:       { fontSize: "15px", fontWeight: 700, color: C.texto, margin: "0 0 12px" },
  linhas:       { marginBottom: "12px" },
  linha:        { display: "flex", justifyContent: "space-between", padding: "7px 0", fontSize: "13px", borderBottom: `0.5px solid ${C.borda}` },
  lL:           { color: C.textoSecundario, flexShrink: 0 },
  lV:           { color: C.texto, fontWeight: 500, textAlign: "right" as const, maxWidth: "60%" },
  avisoAzul:    { fontSize: "13px", color: "#1e40af", background: "#dbeafe", borderRadius: "10px", padding: "10px 12px", marginBottom: "12px", lineHeight: "1.5" },
  avisoAmarelo: { fontSize: "13px", color: "#92400e", background: "#fef3c7", borderRadius: "10px", padding: "10px 12px", marginBottom: "12px", lineHeight: "1.5" },
  campo:        { marginBottom: "12px" },
  campoLabel:   { display: "block", fontSize: "13px", color: C.textoSecundario, marginBottom: "4px" },
  campoInput:   { width: "100%", boxSizing: "border-box" as const, padding: "11px 12px", border: `1px solid ${C.borda}`, borderRadius: "10px", fontSize: "14px", color: C.texto, background: "#fff" },
  acoes:        { display: "flex", gap: "8px" },
  btnRegistrar: { display: "block", width: "100%", background: "#606C38", color: "#F8FAFC", border: "none", borderRadius: "12px", padding: "14px", fontSize: "15px", fontWeight: 600, cursor: "pointer", textAlign: "center" as const, boxSizing: "border-box" as const, marginBottom: "8px" },
  btnVoltar:    { flex: 1, background: "transparent", border: `1px solid ${C.borda}`, color: C.texto, borderRadius: "10px", padding: "13px", fontSize: "14px", cursor: "pointer" },
  btnConfirmar: { flex: 2, background: "#606C38", color: "#F8FAFC", border: "none", borderRadius: "10px", padding: "13px", fontSize: "15px", fontWeight: 600, cursor: "pointer" },
  btnFechar:    { display: "block", width: "100%", background: "transparent", border: `1px solid ${C.borda}`, color: C.texto, borderRadius: "12px", padding: "11px", fontSize: "14px", cursor: "pointer", textAlign: "center" as const, boxSizing: "border-box" as const },
  erro:         { color: C.erro, fontSize: "13px", margin: "4px 0" },
}
