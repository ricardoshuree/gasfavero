// [mcp-local harness] feature: devolucao-cascos-motorista | plano: 54267dc7 | 2026-09-07 18:28:02
// DevolucaoCascosTela — lista cascos em aberto com toggle meus/todos, grupos por status, sheet de detalhe com fluxo de confirmação de devolução física (PATCH /cascos/{id}/receber)
// Tela de Devolução de Cascos — app motorista
// Lista cascos emprestados (em aberto, sem confirmação do gerente)
// Toggle meus/todos · sheet de detalhe · registrar devolução física (step 1)
import { useEffect, useState, type CSSProperties } from "react"
import { CORES_APP as C } from "../theme"
import type { UserMe } from "../lib/auth"
import {
  buscarCascosEmAberto,
  corStatus,
  labelDias,
  labelStatus,
  registrarRecebimentoCasco,
  type Casco,
} from "../lib/cascos"

function formatData(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString("pt-BR")
}

interface Props {
  token: string
  usuario: UserMe
}

// ---------------------------------------------------------------------------
// Sheet de confirmação de devolução
// ---------------------------------------------------------------------------
function DevolucaoSheet({
  casco,
  token,
  onFechar,
  onSucesso,
}: {
  casco: Casco
  token: string
  onFechar: () => void
  onSucesso: (atualizado: Casco) => void
}) {
  const [observacao, setObservacao] = useState("")
  const [confirmando, setConfirmando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState("")

  const jaRecebido = casco.status === "recebido_aguardando"

  async function handleRegistrar() {
    setSalvando(true)
    setErro("")
    try {
      const atualizado = await registrarRecebimentoCasco(token, casco.id, observacao || undefined)
      onSucesso(atualizado)
    } catch (e: any) {
      setErro(e.message ?? "Erro ao registrar devolução.")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div style={ss.overlay} onClick={onFechar}>
      <div style={ss.sheet} onClick={e => e.stopPropagation()}>
        <div style={ss.handle} />

        {/* Detalhe */}
        {!confirmando && (
          <>
            <p style={ss.titulo}>{casco.cliente_nome}</p>

            <div style={ss.linhas}>
              <div style={ss.linha}>
                <span style={ss.lL}>Produto</span>
                <span style={ss.lV}>{casco.quantidade}× {casco.produto_nome}</span>
              </div>
              <div style={ss.linha}>
                <span style={ss.lL}>Motorista</span>
                <span style={ss.lV}>{casco.motorista_nome ?? "—"}</span>
              </div>
              <div style={ss.linha}>
                <span style={ss.lL}>Emprestado em</span>
                <span style={ss.lV}>{formatData(casco.created_at)}</span>
              </div>
              <div style={ss.linha}>
                <span style={ss.lL}>Em aberto há</span>
                <span style={{ ...ss.lV, color: casco.dias_em_aberto >= 14 ? "#dc2626" : "#92400e", fontWeight: 700 }}>
                  {labelDias(casco.dias_em_aberto)}
                </span>
              </div>
              {jaRecebido && casco.recebido_por_nome && (
                <div style={ss.linha}>
                  <span style={ss.lL}>Recebido por</span>
                  <span style={ss.lV}>{casco.recebido_por_nome}</span>
                </div>
              )}
              <div style={{ ...ss.linha, borderBottom: "none" }}>
                <span style={ss.lL}>Status</span>
                <span style={{
                  ...ss.lV,
                  background: corStatus(casco.status).bg,
                  color: corStatus(casco.status).text,
                  padding: "2px 8px",
                  borderRadius: "8px",
                  fontSize: "11px",
                  fontWeight: 600,
                }}>
                  {labelStatus(casco.status)}
                </span>
              </div>
            </div>

            {jaRecebido ? (
              <div style={ss.avisoAzul}>
                ✓ Devolução registrada por você ou outro motorista. Aguardando confirmação do gerente no sistema web.
              </div>
            ) : (
              <button style={ss.btnRegistrar} onClick={() => setConfirmando(true)}>
                🔄 Registrar devolução física
              </button>
            )}

            <button style={ss.btnFechar} onClick={onFechar}>Fechar</button>
          </>
        )}

        {/* Confirmação antes de salvar */}
        {confirmando && (
          <>
            <p style={ss.titulo}>Confirmar devolução</p>
            <div style={ss.avisoAmarelo}>
              Você está confirmando que recebeu fisicamente <strong>{casco.quantidade}× {casco.produto_nome}</strong> do cliente <strong>{casco.cliente_nome}</strong>. O gerente fará a baixa formal no sistema web.
            </div>

            <div style={ss.campo}>
              <label style={ss.campoLabel}>Observação (opcional)</label>
              <input
                style={ss.campoInput}
                placeholder="Ex: botijão com amassado..."
                value={observacao}
                onChange={e => setObservacao(e.target.value)}
              />
            </div>

            {erro && <p style={ss.erro}>{erro}</p>}

            <div style={ss.acoes}>
              <button style={ss.btnVoltar} onClick={() => { setConfirmando(false); setErro("") }} disabled={salvando}>
                ← Voltar
              </button>
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

// ---------------------------------------------------------------------------
// Tela principal
// ---------------------------------------------------------------------------
export default function DevolucaoCascosTela({ token, usuario }: Props) {
  const [todos, setTodos] = useState<Casco[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState("")
  const [somenteMeus, setSomenteMeus] = useState(true)
  const [selecionado, setSelecionado] = useState<Casco | null>(null)

  async function carregar(filtrarMeus: boolean) {
    setCarregando(true)
    setErro("")
    try {
      const motorista_id = filtrarMeus ? usuario.id : undefined
      const res = await buscarCascosEmAberto(token, motorista_id)
      setTodos(res.data)
    } catch {
      setErro("Não foi possível carregar os cascos em aberto.")
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { carregar(somenteMeus) }, [somenteMeus])

  function handleSucesso(atualizado: Casco) {
    // Atualiza o item na lista sem recarregar tudo
    setTodos(prev => prev.map(c => c.id === atualizado.id ? atualizado : c))
    setSelecionado(null)
  }

  // Separar emprestados vs recebidos aguardando gerente
  const emprestados = todos.filter(c => c.status === "emprestado")
  const aguardando  = todos.filter(c => c.status === "recebido_aguardando")

  const totalCascos = todos.reduce((acc, c) => acc + c.quantidade, 0)

  return (
    <div style={s.pagina}>

      {/* Cabeçalho com toggle e resumo */}
      <div style={s.topo}>
        <div style={s.toggleRow}>
          <div style={s.toggleWrap} onClick={() => setSomenteMeus(p => !p)}>
            <div style={{ ...s.toggle, background: somenteMeus ? "#606C38" : "#e5e7eb" }}>
              <div style={{ ...s.toggleDot, left: somenteMeus ? "3px" : "19px" }} />
            </div>
            <span style={s.toggleLabel}>
              {somenteMeus ? "Somente meus" : "Todos os motoristas"}
            </span>
          </div>
          <span style={s.resumoBadge}>{totalCascos} casco{totalCascos !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {carregando && <p style={s.info}>Carregando cascos...</p>}
      {erro      && <p style={s.erroCentral}>{erro}</p>}

      {!carregando && todos.length === 0 && (
        <div style={s.vazio}>
          <p style={s.vazioEmoji}>✅</p>
          <p style={s.vazioTitulo}>Nenhum casco em aberto</p>
          <p style={s.vazioSub}>
            {somenteMeus ? "Todos os seus botijões foram devolvidos." : "Nenhum botijão emprestado no momento."}
          </p>
        </div>
      )}

      {/* Grupo: aguardando devolução (emprestados) */}
      {emprestados.length > 0 && (
        <div style={s.grupo}>
          <div style={s.grupoTitulo}>⏳ Aguardando devolução ({emprestados.length})</div>
          {emprestados.map(c => <CardCasco key={c.id} casco={c} onTap={() => setSelecionado(c)} />)}
        </div>
      )}

      {/* Grupo: recebido, aguardando confirmação do gerente */}
      {aguardando.length > 0 && (
        <div style={s.grupo}>
          <div style={s.grupoTitulo}>🔵 Recebido — aguarda gerente ({aguardando.length})</div>
          {aguardando.map(c => <CardCasco key={c.id} casco={c} onTap={() => setSelecionado(c)} />)}
        </div>
      )}

      {selecionado && (
        <DevolucaoSheet
          casco={selecionado}
          token={token}
          onFechar={() => setSelecionado(null)}
          onSucesso={handleSucesso}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Card de casco
// ---------------------------------------------------------------------------
function CardCasco({ casco, onTap }: { casco: Casco; onTap: () => void }) {
  const { bg, text } = corStatus(casco.status)
  const urgente = casco.status === "emprestado" && casco.dias_em_aberto >= 14
  return (
    <div
      style={{
        ...s.card,
        borderColor: urgente ? "#fca5a5" : "#e5e7eb",
        borderWidth: urgente ? "1.5px" : "1px",
      }}
      onClick={onTap}
    >
      <div style={s.cardRow1}>
        <div style={{ flex: 1 }}>
          <div style={s.cardNome}>{casco.cliente_nome}</div>
          <div style={s.cardSub}>
            {casco.quantidade}× {casco.produto_nome}
            {casco.motorista_nome && casco.status === "emprestado"
              ? ` · ${casco.motorista_nome}`
              : ""}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: "8px" }}>
          <span style={{ ...s.badge, background: bg, color: text }}>{labelStatus(casco.status)}</span>
          <div style={{
            fontSize: "12px",
            fontWeight: 600,
            color: casco.dias_em_aberto >= 14 ? "#dc2626" : "#92400e",
            marginTop: "4px",
          }}>
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

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------
const s: Record<string, CSSProperties> = {
  pagina:       { background: C.fundo, minHeight: "100%", paddingBottom: "80px" },
  topo:         { padding: "10px 14px 0" },
  toggleRow:    { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" },
  toggleWrap:   { display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", userSelect: "none" },
  toggle:       { width: "36px", height: "20px", borderRadius: "10px", position: "relative", flexShrink: 0, transition: "background .2s" },
  toggleDot:    { position: "absolute", top: "3px", width: "14px", height: "14px", borderRadius: "50%", background: "#fff", transition: "left .2s" },
  toggleLabel:  { fontSize: "13px", color: C.texto, fontWeight: 500 },
  resumoBadge:  { fontSize: "14px", fontWeight: 700, color: "#92400e" },
  info:         { textAlign: "center", color: C.textoSecundario, fontSize: "14px", padding: "2rem" },
  erroCentral:  { color: C.erro, fontSize: "13px", textAlign: "center", padding: "0.5rem 1rem" },
  vazio:        { padding: "3rem 1rem", textAlign: "center" },
  vazioEmoji:   { fontSize: "36px", margin: "0 0 8px" },
  vazioTitulo:  { fontSize: "15px", fontWeight: 600, color: C.texto, margin: "0 0 4px" },
  vazioSub:     { fontSize: "13px", color: C.textoSecundario, margin: 0 },
  grupo:        { padding: "0 14px", marginTop: "8px" },
  grupoTitulo:  { fontSize: "11px", fontWeight: 700, color: C.textoSecundario, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "8px", marginTop: "10px" },
  card:         { background: "#fff", borderStyle: "solid", borderRadius: "12px", padding: "11px 13px", marginBottom: "8px", cursor: "pointer" },
  cardRow1:     { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" },
  cardNome:     { fontSize: "14px", fontWeight: 700, color: C.texto },
  cardSub:      { fontSize: "11px", color: C.textoSecundario, marginTop: "2px" },
  badge:        { fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "8px" },
  cardRodape:   { display: "flex", justifyContent: "space-between", alignItems: "center" },
  cardData:     { fontSize: "11px", color: C.textoSecundario },
  cardSeta:     { fontSize: "18px", color: C.textoSecundario },
}

const ss: Record<string, CSSProperties> = {
  overlay:     { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", zIndex: 100 },
  sheet:       { background: "#fff", borderRadius: "16px 16px 0 0", padding: "16px", width: "100%", boxSizing: "border-box", maxHeight: "90vh", overflowY: "auto" },
  handle:      { width: "36px", height: "4px", background: C.borda, borderRadius: "2px", margin: "0 auto 12px" },
  titulo:      { fontSize: "15px", fontWeight: 700, color: C.texto, margin: "0 0 12px" },
  linhas:      { marginBottom: "12px" },
  linha:       { display: "flex", justifyContent: "space-between", padding: "7px 0", fontSize: "13px", borderBottom: `0.5px solid ${C.borda}` },
  lL:          { color: C.textoSecundario, flexShrink: 0 },
  lV:          { color: C.texto, fontWeight: 500, textAlign: "right", maxWidth: "60%" },
  avisoAzul:   { fontSize: "13px", color: "#1e40af", background: "#dbeafe", borderRadius: "10px", padding: "10px 12px", marginBottom: "12px", lineHeight: "1.5" },
  avisoAmarelo:{ fontSize: "13px", color: "#92400e", background: "#fef3c7", borderRadius: "10px", padding: "10px 12px", marginBottom: "12px", lineHeight: "1.5" },
  campo:       { marginBottom: "12px" },
  campoLabel:  { display: "block", fontSize: "13px", color: C.textoSecundario, marginBottom: "4px" },
  campoInput:  { width: "100%", boxSizing: "border-box", padding: "11px 12px", border: `1px solid ${C.borda}`, borderRadius: "10px", fontSize: "14px", color: C.texto, background: "#fff" },
  acoes:       { display: "flex", gap: "8px" },
  btnRegistrar:{ display: "block", width: "100%", background: "#606C38", color: "#F8FAFC", border: "none", borderRadius: "12px", padding: "14px", fontSize: "15px", fontWeight: 600, cursor: "pointer", textAlign: "center", boxSizing: "border-box", marginBottom: "8px" },
  btnVoltar:   { flex: 1, background: "transparent", border: `1px solid ${C.borda}`, color: C.texto, borderRadius: "10px", padding: "13px", fontSize: "14px", cursor: "pointer" },
  btnConfirmar:{ flex: 2, background: "#606C38", color: "#F8FAFC", border: "none", borderRadius: "10px", padding: "13px", fontSize: "15px", fontWeight: 600, cursor: "pointer" },
  btnFechar:   { display: "block", width: "100%", background: "transparent", border: `1px solid ${C.borda}`, color: C.texto, borderRadius: "12px", padding: "11px", fontSize: "14px", cursor: "pointer", textAlign: "center", boxSizing: "border-box" },
  erro:        { color: C.erro, fontSize: "13px", margin: "4px 0" },
}
