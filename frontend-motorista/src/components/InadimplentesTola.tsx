// [mcp-local harness] feature: fix-toggle-todos-meus | plano: 09bda2e0 | 2026-09-07 19:40:30
// Toggle invertido: ligado (verde) = todos, desligado = somente meus. Badge meu aparece só quando verTodos=true.
// Tela de Inadimplentes — app motorista
// Toggle todos/meus, busca por nome/CPF, ordenado por dias de atraso (maior primeiro)
// Sheet detalhe com endereço da venda e botão "Receber pagamento"
// que abre diretamente o ConfirmarSheet do recebimento de fiado
import { useEffect, useState, type CSSProperties } from "react"
import { CORES_APP as C } from "../theme"
import type { UserMe } from "../lib/auth"
import {
  buscarInadimplentes,
  corAtraso,
  diasAtraso,
  labelAtraso,
  type InadimplentVenda,
} from "../lib/inadimplentes"
import { marcarFiadoRecebido } from "../lib/fiado"

function formatMoney(v: string | number) {
  return `R$ ${Number(v).toFixed(2).replace(".", ",")}`
}

function formatData(iso: string) {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

interface Props {
  token: string
  usuario: UserMe
}

function ConfirmarSheet({
  venda, token, onFechar, onSucesso,
}: {
  venda: InadimplentVenda
  token: string
  onFechar: () => void
  onSucesso: () => void
}) {
  const [valorPago, setValorPago] = useState(venda.valor_total)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState("")

  async function confirmar() {
    const v = parseFloat(valorPago)
    if (!v || v <= 0) { setErro("Informe o valor recebido."); return }
    if (v > parseFloat(venda.valor_total)) { setErro("Valor não pode ser maior que o total."); return }
    setSalvando(true); setErro("")
    try {
      await marcarFiadoRecebido(token, venda.id, valorPago)
      onSucesso()
    } catch (e: any) {
      setErro(e.message ?? "Erro ao registrar recebimento.")
    } finally { setSalvando(false) }
  }

  return (
    <div style={ss.overlay} onClick={onFechar}>
      <div style={ss.sheet} onClick={e => e.stopPropagation()}>
        <div style={ss.handle} />
        <p style={ss.titulo}>Confirmar recebimento</p>
        <div style={ss.resumo}>
          <div style={ss.rRow}><span style={ss.rL}>Cliente</span><span style={ss.rV}>{venda.cliente_nome}</span></div>
          <div style={ss.rRow}><span style={ss.rL}>Vale nº</span><span style={ss.rV}>{venda.vale_numero ?? "—"}</span></div>
          <div style={ss.rRow}><span style={ss.rL}>Produtos</span><span style={ss.rV}>{venda.itens.map(i => `${i.quantidade}× ${i.produto_title}`).join(", ")}</span></div>
          <div style={{ ...ss.rRow, ...ss.rTotal }}><span>Total do fiado</span><span>{formatMoney(venda.valor_total)}</span></div>
        </div>
        <div style={ss.campo}>
          <label style={ss.campoLabel}>Valor recebido (R$)</label>
          <input
            style={ss.campoInput}
            type="number" inputMode="decimal" step="0.01"
            value={valorPago}
            onChange={e => { setValorPago(e.target.value); setErro("") }}
            autoFocus
          />
          {parseFloat(valorPago) < parseFloat(venda.valor_total) && parseFloat(valorPago) > 0 && (
            <p style={ss.avisoSmall}>Pagamento parcial — restante continua em aberto.</p>
          )}
        </div>
        <p style={ss.avisoInfo}>
          A baixa formal será confirmada pelo gerente no sistema web. Valor entra no Malote e no Fechamento do Dia.
        </p>
        {erro && <p style={ss.erro}>{erro}</p>}
        <div style={ss.acoes}>
          <button style={ss.btnVoltar} onClick={onFechar} disabled={salvando}>← Voltar</button>
          <button style={ss.btnConfirmar} onClick={confirmar} disabled={salvando}>
            {salvando ? "Registrando..." : "✓ Recebi o pagamento"}
          </button>
        </div>
      </div>
    </div>
  )
}

function DetalheSheet({
  venda, token, onFechar, onRecebimentoConfirmado,
}: {
  venda: InadimplentVenda
  token: string
  onFechar: () => void
  onRecebimentoConfirmado: (id: string) => void
}) {
  const [confirmar, setConfirmar] = useState(false)
  const dias = diasAtraso(venda.data_venda)
  const { bg, text } = corAtraso(dias)
  const label = labelAtraso(dias)

  function enderecoStr() {
    if (!venda.endereco) return "Não informado"
    const { rua_nome, numero, bairro_nome, complemento } = venda.endereco
    return `${rua_nome}, ${numero}${complemento ? ` (${complemento})` : ""} — ${bairro_nome}`
  }

  if (confirmar) {
    return (
      <ConfirmarSheet
        venda={venda} token={token}
        onFechar={() => setConfirmar(false)}
        onSucesso={() => { onRecebimentoConfirmado(venda.id); onFechar() }}
      />
    )
  }

  return (
    <div style={ss.overlay} onClick={onFechar}>
      <div style={ss.sheet} onClick={e => e.stopPropagation()}>
        <div style={ss.handle} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <p style={{ ...ss.titulo, margin: 0 }}>{venda.cliente_nome}</p>
          <span style={{ fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "8px", background: bg, color: text }}>
            {label}
          </span>
        </div>
        <div style={ss.linhas}>
          <div style={ss.linha}><span style={ss.lL}>Vale nº</span><span style={ss.lV}>{venda.vale_numero ?? "—"}</span></div>
          <div style={ss.linha}><span style={ss.lL}>Produto</span><span style={ss.lV}>{venda.itens.map(i => `${i.quantidade}× ${i.produto_title}`).join(", ")}</span></div>
          <div style={ss.linha}><span style={ss.lL}>Endereço na venda</span><span style={ss.lV}>{enderecoStr()}</span></div>
          <div style={ss.linha}><span style={ss.lL}>Data da venda</span><span style={ss.lV}>{formatData(venda.data_venda)}</span></div>
          {venda.data_pagamento_vale && (
            <div style={ss.linha}>
              <span style={ss.lL}>Vencimento</span>
              <span style={{ ...ss.lV, color: "#dc2626" }}>{formatData(venda.data_pagamento_vale)}</span>
            </div>
          )}
          <div style={ss.linha}>
            <span style={ss.lL}>Em atraso há</span>
            <span style={{ ...ss.lV, color: text, fontWeight: 700 }}>{dias} dias</span>
          </div>
          <div style={{ ...ss.linha, borderBottom: "none" }}>
            <span style={ss.lL}>Vendido por</span>
            <span style={ss.lV}>{venda.motorista_nome}</span>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 12px", fontSize: "16px", fontWeight: 700, color: C.texto }}>
          <span>Total</span>
          <span>{formatMoney(venda.valor_total)}</span>
        </div>
        <button style={s.btnPagar} onClick={() => setConfirmar(true)}>💰 Receber pagamento</button>
        <button style={s.btnFechar} onClick={onFechar}>Fechar</button>
      </div>
    </div>
  )
}

export default function InadimplentesTola({ token, usuario }: Props) {
  const [todos, setTodos] = useState<InadimplentVenda[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState("")
  // false = somente meus (padrão), true = todos os motoristas
  const [verTodos, setVerTodos] = useState(false)
  const [busca, setBusca] = useState("")
  const [selecionada, setSelecionada] = useState<InadimplentVenda | null>(null)

  useEffect(() => {
    buscarInadimplentes(token)
      .then(setTodos)
      .catch(() => setErro("Não foi possível carregar os inadimplentes."))
      .finally(() => setCarregando(false))
  }, [token])

  function handleRecebimentoConfirmado(id: string) {
    setTodos(prev => prev.filter(v => v.id !== id))
  }

  const filtrados = todos
    .filter(v => verTodos ? true : v.motorista_id === usuario.id)
    .filter(v => {
      if (!busca.trim()) return true
      const q = busca.trim().toLowerCase()
      return v.cliente_nome.toLowerCase().includes(q)
    })
    .sort((a, b) => diasAtraso(b.data_venda) - diasAtraso(a.data_venda))

  const totalValor = filtrados.reduce((acc, v) => acc + Number(v.valor_total), 0)

  return (
    <div style={s.pagina}>
      <div style={s.topo}>
        <div style={s.toggleRow}>
          {/* Toggle: desligado = meus, ligado (verde) = todos */}
          <div style={s.toggleWrap} onClick={() => setVerTodos(p => !p)}>
            <div style={{ ...s.toggle, background: verTodos ? "#606C38" : "#e5e7eb" }}>
              <div style={{ ...s.toggleDot, left: verTodos ? "19px" : "3px" }} />
            </div>
            <span style={s.toggleLabel}>
              {verTodos ? "Todos os vendedores" : "Somente meus"}
            </span>
          </div>
          <div style={s.resumoMini}>
            <span style={s.resumoQtd}>{filtrados.length}</span>
            <span style={s.resumoVal}>{formatMoney(totalValor.toFixed(2))}</span>
          </div>
        </div>

        <div style={s.searchBox}>
          <span>🔍</span>
          <input
            style={s.searchInput}
            placeholder="Buscar por nome ou CPF..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
          {busca && <button style={s.clearBtn} onClick={() => setBusca("")}>✕</button>}
        </div>
      </div>

      {carregando && <p style={s.info}>Carregando...</p>}
      {erro && <p style={s.erroCentral}>{erro}</p>}

      {!carregando && filtrados.length === 0 && (
        <div style={s.vazio}>
          <p style={s.vazioTitulo}>Nenhum inadimplente</p>
          <p style={s.vazioSub}>
            {verTodos ? "Nenhum fiado em atraso no momento." : "Seus clientes estão em dia."}
          </p>
        </div>
      )}

      <div style={s.lista}>
        {filtrados.map(v => {
          const dias = diasAtraso(v.data_venda)
          const { bg, text } = corAtraso(dias)
          const label = labelAtraso(dias)
          const ehMeu = v.motorista_id === usuario.id
          const borderColor = dias >= 50 ? "#dc2626" : "#d97706"

          return (
            <div key={v.id} style={{ ...s.card, borderColor }} onClick={() => setSelecionada(v)}>
              <div style={s.cardHeader}>
                <div style={{ flex: 1 }}>
                  <div style={s.cardNome}>
                    {v.cliente_nome}
                    {ehMeu && verTodos && <span style={s.badgeMeu}>meu</span>}
                  </div>
                  <div style={s.cardSub}>
                    {v.itens.map(i => `${i.quantidade}× ${i.produto_title}`).join(", ")}
                    {v.vale_numero ? ` · Vale nº ${v.vale_numero}` : ""}
                    {" · venda "}{formatData(v.data_venda)}
                  </div>
                </div>
                <div style={{ textAlign: "right" as const, flexShrink: 0, marginLeft: "8px" }}>
                  <div style={s.cardValor}>{formatMoney(v.valor_total)}</div>
                  <span style={{ ...s.badge, background: bg, color: text }}>{label}</span>
                </div>
              </div>
              <div style={{ ...s.diasAtraso, color: text }}>{dias} dias em atraso</div>
            </div>
          )
        })}
      </div>

      {selecionada && (
        <DetalheSheet
          venda={selecionada} token={token}
          onFechar={() => setSelecionada(null)}
          onRecebimentoConfirmado={handleRecebimentoConfirmado}
        />
      )}
    </div>
  )
}

const s: Record<string, CSSProperties> = {
  pagina:      { background: C.fundo, minHeight: "100%", paddingBottom: "80px" },
  topo:        { padding: "10px 14px 0" },
  toggleRow:   { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" },
  toggleWrap:  { display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", userSelect: "none" as const },
  toggle:      { width: "36px", height: "20px", borderRadius: "10px", position: "relative" as const, flexShrink: 0, transition: "background .2s" },
  toggleDot:   { position: "absolute" as const, top: "3px", width: "14px", height: "14px", borderRadius: "50%", background: "#fff", transition: "left .2s" },
  toggleLabel: { fontSize: "13px", color: C.texto, fontWeight: 500 },
  resumoMini:  { display: "flex", gap: "12px", alignItems: "center" },
  resumoQtd:   { fontSize: "18px", fontWeight: 700, color: "#b45309" },
  resumoVal:   { fontSize: "13px", fontWeight: 600, color: "#b45309" },
  searchBox:   { display: "flex", alignItems: "center", gap: "8px", background: C.fundoCard, border: `1px solid ${C.borda}`, borderRadius: "10px", padding: "9px 12px", marginBottom: "10px" },
  searchInput: { border: "none", background: "transparent", fontSize: "13px", color: C.texto, flex: 1, outline: "none" },
  clearBtn:    { background: "none", border: "none", fontSize: "13px", color: C.textoSecundario, cursor: "pointer", padding: 0 },
  info:        { textAlign: "center" as const, color: C.textoSecundario, fontSize: "14px", padding: "1rem" },
  erroCentral: { color: C.erro, fontSize: "13px", textAlign: "center" as const, padding: "0.5rem 1rem" },
  vazio:       { textAlign: "center" as const, padding: "2rem 1rem" },
  vazioTitulo: { fontSize: "15px", fontWeight: 600, color: C.texto, margin: "0 0 4px" },
  vazioSub:    { fontSize: "13px", color: C.textoSecundario, margin: 0 },
  lista:       { padding: "0 14px" },
  card:        { background: "#fff", border: "1.5px solid", borderRadius: "12px", padding: "11px 13px", marginBottom: "8px", cursor: "pointer" },
  cardHeader:  { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" },
  cardNome:    { fontSize: "14px", fontWeight: 700, color: C.texto, display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" as const },
  cardSub:     { fontSize: "11px", color: C.textoSecundario, marginTop: "2px" },
  cardValor:   { fontSize: "14px", fontWeight: 700, color: C.texto, marginBottom: "3px" },
  badge:       { fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "8px", display: "inline-block" },
  badgeMeu:    { fontSize: "10px", background: "#f0f4eb", color: "#3a5c1a", padding: "1px 6px", borderRadius: "6px", fontWeight: 600 },
  diasAtraso:  { fontSize: "12px", fontWeight: 600, marginTop: "2px" },
  btnPagar:    { display: "block", width: "100%", background: "#606C38", color: "#F8FAFC", border: "none", borderRadius: "12px", padding: "13px", fontSize: "15px", fontWeight: 600, cursor: "pointer", textAlign: "center" as const, boxSizing: "border-box" as const, marginBottom: "6px" },
  btnFechar:   { display: "block", width: "100%", background: "transparent", border: `1px solid ${C.borda}`, color: C.texto, borderRadius: "12px", padding: "11px", fontSize: "14px", cursor: "pointer", textAlign: "center" as const, boxSizing: "border-box" as const },
}

const ss: Record<string, CSSProperties> = {
  overlay:    { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", zIndex: 100 },
  sheet:      { background: "#fff", borderRadius: "16px 16px 0 0", padding: "16px", width: "100%", boxSizing: "border-box" as const, maxHeight: "90vh", overflowY: "auto" as const },
  handle:     { width: "36px", height: "4px", background: C.borda, borderRadius: "2px", margin: "0 auto 12px" },
  titulo:     { fontSize: "15px", fontWeight: 700, color: C.texto, margin: "0 0 10px" },
  linhas:     { marginBottom: "8px" },
  linha:      { display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: "13px", borderBottom: `0.5px solid ${C.borda}` },
  lL:         { color: C.textoSecundario, flexShrink: 0 },
  lV:         { color: C.texto, fontWeight: 500, textAlign: "right" as const, maxWidth: "58%", wordBreak: "break-word" as const },
  resumo:     { background: C.fundoCard, borderRadius: "10px", padding: "10px 12px", marginBottom: "12px" },
  rRow:       { display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: "13px", borderBottom: `0.5px solid ${C.borda}` },
  rL:         { color: C.textoSecundario },
  rV:         { color: C.texto, fontWeight: 500, textAlign: "right" as const },
  rTotal:     { borderBottom: "none", fontWeight: 700, fontSize: "15px", paddingTop: "8px" },
  campo:      { marginBottom: "10px" },
  campoLabel: { display: "block", fontSize: "13px", color: C.textoSecundario, marginBottom: "4px" },
  campoInput: { width: "100%", boxSizing: "border-box" as const, padding: "12px", border: `1px solid ${C.borda}`, borderRadius: "10px", fontSize: "18px", color: C.texto, background: "#fff", fontWeight: 600, outline: "none" },
  avisoSmall: { fontSize: "12px", color: "#92400e", margin: "4px 0 0" },
  avisoInfo:  { fontSize: "12px", color: C.textoSecundario, margin: "0 0 10px", lineHeight: "1.5" },
  erro:       { color: C.erro, fontSize: "13px", margin: "4px 0" },
  acoes:      { display: "flex", gap: "8px" },
  btnVoltar:  { flex: 1, background: "transparent", border: `1px solid ${C.borda}`, color: C.texto, borderRadius: "10px", padding: "13px", fontSize: "14px", cursor: "pointer" },
  btnConfirmar: { flex: 2, background: "#606C38", color: "#F8FAFC", border: "none", borderRadius: "10px", padding: "13px", fontSize: "15px", fontWeight: 600, cursor: "pointer" },
}
