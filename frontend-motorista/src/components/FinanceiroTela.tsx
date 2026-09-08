// [mcp-local harness] feature: fix-cosmetico-livro-vendas | plano: d1f3d354 | 2026-09-08 12:20:47
// FinanceiroTela: padding reduzido, filtros mais compactos no topo
// Livro de Vendas do motorista — lista filtrada por período
// paddingTop reduzido — cabeçalho compacto sem espaço vazio
import { useCallback, useEffect, useState, type CSSProperties } from "react"
import { CORES_APP as C } from "../theme"
import type { UserMe } from "../lib/auth"
import {
  buscarMinhasVendas, cancelarVenda, editarVenda,
  isHoje, periodoDatas,
  type PeriodoFiltro, type VendaMotorista,
} from "../lib/minhasVendas"

const FORMAS_SIMPLES = ["cartao_debito", "cartao_credito", "pix", "dinheiro"]

const LABEL_FORMA: Record<string, string> = {
  cartao_debito:  "Cartão Débito",
  cartao_credito: "Cartão Crédito",
  pix:            "Pix",
  dinheiro:       "Dinheiro",
  vale:           "Fiado",
  vale_gas:       "Vale Gás",
  gas_povo:       "Gás do Povo",
}

const PERIODOS: { id: PeriodoFiltro; label: string }[] = [
  { id: "hoje",   label: "Hoje" },
  { id: "ontem",  label: "Ontem" },
  { id: "semana", label: "Semana" },
  { id: "mes",    label: "Mês" },
]

function formatMoney(v: string | number) {
  return `R$ ${Number(v).toFixed(2).replace(".", ",")}`
}
function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}
function formatData(iso: string) {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}
function formatEndereco(end: VendaMotorista["endereco"]): string | null {
  if (!end) return null
  const comp = end.complemento ? ` (${end.complemento})` : ""
  return `${end.rua_nome}, ${end.numero}${comp} — ${end.bairro_nome}`
}

interface Props {
  token: string
  usuario: UserMe
}

function VendaSheet({
  venda, token, onFechar, onAtualizar,
}: {
  venda: VendaMotorista
  token: string
  onFechar: () => void
  onAtualizar: (v: VendaMotorista) => void
}) {
  const podeEditar = isHoje(venda.data_venda) && venda.status !== "cancelada"
  const formaAtualSimples = FORMAS_SIMPLES.includes(venda.forma_pagamento)

  const [modo, setModo] = useState<"detalhe" | "editar" | "confirmar_cancel">("detalhe")
  const [novaForma, setNovaForma] = useState(venda.forma_pagamento)
  const [novoValor, setNovoValor] = useState(venda.valor_pago)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState("")

  const formaNovaSimples = FORMAS_SIMPLES.includes(novaForma)
  const trocouParaComplexo = !formaNovaSimples && novaForma !== venda.forma_pagamento

  async function handleEditar() {
    setSalvando(true); setErro("")
    try {
      const dados: { forma_pagamento?: string; valor_pago?: string } = {}
      if (novaForma !== venda.forma_pagamento) dados.forma_pagamento = novaForma
      if (novoValor !== venda.valor_pago) dados.valor_pago = novoValor
      if (Object.keys(dados).length === 0) { setErro("Nenhuma alteração detectada."); setSalvando(false); return }
      const atualizada = await editarVenda(token, venda.id, dados)
      onAtualizar(atualizada); onFechar()
    } catch (e: any) { setErro(e.message ?? "Erro ao editar venda.") }
    finally { setSalvando(false) }
  }

  async function handleCancelar() {
    setSalvando(true); setErro("")
    try {
      const atualizada = await cancelarVenda(token, venda.id)
      onAtualizar(atualizada); onFechar()
    } catch (e: any) { setErro(e.message ?? "Erro ao cancelar venda.") }
    finally { setSalvando(false) }
  }

  const enderecoStr = formatEndereco(venda.endereco)

  return (
    <div style={ss.overlay} onClick={onFechar}>
      <div style={ss.sheet} onClick={e => e.stopPropagation()}>
        <div style={ss.handle} />

        {modo === "detalhe" && (
          <>
            <div style={ss.titulo}>
              <span>{venda.cliente_nome}</span>
              {venda.status === "cancelada" && <span style={ss.badgeCancelada}>Cancelada</span>}
            </div>
            <div style={ss.linhas}>
              <div style={ss.linha}><span style={ss.lLabel}>Produtos</span><span style={ss.lValor}>{venda.itens.map(i => `${i.quantidade}× ${i.produto_title}`).join(", ")}</span></div>
              <div style={ss.linha}><span style={ss.lLabel}>Pagamento</span><span style={ss.lValor}>{LABEL_FORMA[venda.forma_pagamento] ?? venda.forma_pagamento}</span></div>
              <div style={ss.linha}><span style={ss.lLabel}>Valor</span><span style={ss.lValor}>{formatMoney(venda.valor_pago)}</span></div>
              {enderecoStr && (
                <div style={ss.linha}><span style={ss.lLabel}>Endereço</span><span style={ss.lValor}>📍 {enderecoStr}</span></div>
              )}
              <div style={ss.linha}><span style={ss.lLabel}>Data</span><span style={ss.lValor}>{formatData(venda.data_venda)} {formatHora(venda.created_at)}</span></div>
              {venda.status === "cancelada" && venda.cancelada_por_nome && (
                <div style={ss.linha}><span style={ss.lLabel}>Cancelada por</span><span style={ss.lValor}>{venda.cancelada_por_nome}</span></div>
              )}
              {venda.qtd_edicoes > 0 && (
                <div style={{ ...ss.linha, borderBottom: "none" }}><span style={ss.lLabel}>Edições</span><span style={{ ...ss.lValor, color: "#92400e" }}>⚠ {venda.qtd_edicoes} edição(ões)</span></div>
              )}
            </div>
            {!podeEditar && venda.status !== "cancelada" && (
              <div style={ss.aviso}>Vendas de dias anteriores não podem ser editadas.</div>
            )}
            {podeEditar && (
              <div style={ss.acoes}>
                <button style={ss.btnEditar} onClick={() => setModo("editar")}>✎ Editar</button>
                <button style={ss.btnCancelar} onClick={() => setModo("confirmar_cancel")}>✕ Cancelar venda</button>
              </div>
            )}
            <button style={ss.btnFechar} onClick={onFechar}>Fechar</button>
          </>
        )}

        {modo === "editar" && (
          <>
            <p style={ss.titulo}>Editar venda</p>
            <div style={ss.campo}>
              <label style={ss.campoLabel}>Forma de pagamento</label>
              <select style={ss.campoInput} value={novaForma} onChange={e => setNovaForma(e.target.value)} disabled={!formaAtualSimples}>
                {Object.entries(LABEL_FORMA).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {!formaAtualSimples && <p style={ss.avisoSmall}>⚠️ {LABEL_FORMA[venda.forma_pagamento]} não permite troca. Cancele e registre nova venda.</p>}
              {trocouParaComplexo && <p style={ss.avisoSmall}>⚠️ Para {LABEL_FORMA[novaForma]}, cancele e registre nova venda.</p>}
            </div>
            <div style={ss.campo}>
              <label style={ss.campoLabel}>Valor pago (R$)</label>
              <input style={ss.campoInput} type="number" step="0.01" value={novoValor} onChange={e => setNovoValor(e.target.value)} />
            </div>
            {erro && <p style={ss.erro}>{erro}</p>}
            <div style={ss.acoes}>
              <button style={ss.btnFechar} onClick={() => { setModo("detalhe"); setErro("") }}>← Voltar</button>
              <button style={{ ...ss.btnEditar, opacity: trocouParaComplexo ? 0.4 : 1 }} disabled={salvando || trocouParaComplexo} onClick={handleEditar}>
                {salvando ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </>
        )}

        {modo === "confirmar_cancel" && (
          <>
            <p style={ss.titulo}>Confirmar cancelamento</p>
            <div style={ss.avisoPerigo}>
              A venda de <strong>{venda.cliente_nome}</strong> ({formatMoney(venda.valor_pago)}) será cancelada. Esta ação não pode ser desfeita.
            </div>
            {erro && <p style={ss.erro}>{erro}</p>}
            <div style={ss.acoes}>
              <button style={ss.btnFechar} onClick={() => setModo("detalhe")}>← Voltar</button>
              <button style={{ ...ss.btnCancelar, flex: 2, fontWeight: 600 }} onClick={handleCancelar} disabled={salvando}>
                {salvando ? "Cancelando..." : "Sim, cancelar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function FinanceiroTela({ token, usuario }: Props) {
  const [periodo, setPeriodo] = useState<PeriodoFiltro>("hoje")
  const [vendas, setVendas] = useState<VendaMotorista[]>([])
  const [somaPago, setSomaPago] = useState("0")
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState("")
  const [vendaSelecionada, setVendaSelecionada] = useState<VendaMotorista | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("")
    try {
      const { inicio, fim } = periodoDatas(periodo)
      const res = await buscarMinhasVendas(token, inicio, fim)
      const minhas = res.data.filter(v => v.motorista_id === usuario.id)
      setVendas(minhas)
      const soma = minhas.filter(v => v.status !== "cancelada").reduce((acc, v) => acc + Number(v.valor_pago), 0)
      setSomaPago(soma.toFixed(2))
    } catch { setErro("Não foi possível carregar as vendas.") }
    finally { setCarregando(false) }
  }, [token, usuario.id, periodo])

  useEffect(() => { carregar() }, [carregar])

  function atualizarVenda(atualizada: VendaMotorista) {
    setVendas(prev => prev.map(v => v.id === atualizada.id ? atualizada : v))
  }

  const ativas = vendas.filter(v => v.status !== "cancelada")

  return (
    <div style={s.pagina}>
      {/* Filtros colados ao topo — sem padding superior extra */}
      <div style={s.filtros}>
        {PERIODOS.map(p => (
          <button key={p.id} style={{ ...s.filtroBt, ...(periodo === p.id ? s.filtroAtivo : {}) }} onClick={() => setPeriodo(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      <div style={s.resumo}>
        <div style={s.resumoCard}>
          <div style={s.resumoLabel}>Vendas</div>
          <div style={s.resumoValor}>{ativas.length}</div>
        </div>
        <div style={s.resumoCard}>
          <div style={s.resumoLabel}>Total recebido</div>
          <div style={{ ...s.resumoValor, color: "#3a5c1a" }}>{formatMoney(somaPago)}</div>
        </div>
      </div>

      {carregando && <p style={s.info}>Carregando...</p>}
      {erro && <p style={s.erroTxt}>{erro}</p>}

      {!carregando && vendas.length === 0 && (
        <div style={s.vazio}>
          <p style={s.vazioTitulo}>Nenhuma venda neste período</p>
          <p style={s.vazioSub}>Suas vendas aparecerão aqui assim que forem registradas.</p>
        </div>
      )}

      <div style={s.lista}>
        {vendas.map(v => {
          const cancelada = v.status === "cancelada"
          const podeEditar = isHoje(v.data_venda) && !cancelada
          return (
            <div key={v.id} style={{ ...s.card, ...(cancelada ? s.cardCancelada : {}) }} onClick={() => setVendaSelecionada(v)}>
              <div style={s.cardRow1}>
                <span style={{ ...s.cardNome, ...(cancelada ? s.riscado : {}) }}>{v.cliente_nome}</span>
                <span style={{ ...s.cardValor, color: cancelada ? "#9ca3af" : C.texto }}>{formatMoney(v.valor_pago)}</span>
              </div>
              <div style={s.cardRow2}>
                <span style={s.cardSub}>
                  {v.itens.map(i => `${i.quantidade}× ${i.produto_title}`).join(", ")} · {LABEL_FORMA[v.forma_pagamento] ?? v.forma_pagamento} · {formatHora(v.created_at)}
                </span>
                <div style={s.badges}>
                  {podeEditar && <span style={s.badgeEditavel}>✎</span>}
                  {cancelada
                    ? <span style={{ ...s.badge, background: "#fee2e2", color: "#991b1b" }}>Cancelada</span>
                    : v.pago_em
                      ? <span style={{ ...s.badge, background: "#f0f4eb", color: "#3a5c1a" }}>Pago</span>
                      : <span style={{ ...s.badge, background: "#fef3c7", color: "#92400e" }}>Em aberto</span>
                  }
                </div>
              </div>
              {v.qtd_edicoes > 0 && !cancelada && (
                <div style={s.editadoAviso}>⚠ {v.qtd_edicoes} edição(ões)</div>
              )}
            </div>
          )
        })}
      </div>

      {vendaSelecionada && (
        <VendaSheet
          venda={vendaSelecionada} token={token}
          onFechar={() => setVendaSelecionada(null)}
          onAtualizar={v => { atualizarVenda(v); setVendaSelecionada(null) }}
        />
      )}
    </div>
  )
}

const s: Record<string, CSSProperties> = {
  // Sem paddingTop — o cabeçalho do subCabecalho já faz a separação
  pagina:      { background: C.fundo, minHeight: "100%" },
  filtros:     { display: "flex", gap: "6px", padding: "8px 14px", background: C.fundoCard, borderBottom: `1px solid ${C.borda}` },
  filtroBt:    { background: "#fff", border: `1px solid ${C.borda}`, borderRadius: "8px", padding: "5px 12px", fontSize: "13px", color: C.texto, cursor: "pointer" },
  filtroAtivo: { background: "#606C38", borderColor: "#606C38", color: "#F8FAFC", fontWeight: 600 },
  resumo:      { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", padding: "8px 14px" },
  resumoCard:  { background: C.fundoCard, borderRadius: "10px", padding: "10px 12px" },
  resumoLabel: { fontSize: "11px", color: C.textoSecundario, marginBottom: "3px" },
  resumoValor: { fontSize: "18px", fontWeight: 700, color: C.texto },
  info:        { textAlign: "center" as const, color: C.textoSecundario, fontSize: "14px", padding: "1rem" },
  erroTxt:     { color: C.erro, fontSize: "13px", textAlign: "center" as const, padding: "0.5rem 1rem" },
  vazio:       { padding: "2rem 1rem", textAlign: "center" as const },
  vazioTitulo: { fontSize: "15px", fontWeight: 600, color: C.texto, margin: "0 0 6px" },
  vazioSub:    { fontSize: "13px", color: C.textoSecundario, margin: 0 },
  lista:       { padding: "0 14px 80px" },
  card:        { background: "#fff", border: `1px solid ${C.borda}`, borderRadius: "12px", padding: "12px", marginBottom: "8px", cursor: "pointer" },
  cardCancelada: { opacity: 0.55, borderStyle: "dashed" as const },
  cardRow1:    { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" },
  cardNome:    { fontSize: "14px", fontWeight: 600, color: C.texto },
  cardValor:   { fontSize: "14px", fontWeight: 600 },
  riscado:     { textDecoration: "line-through" as const },
  cardRow2:    { display: "flex", justifyContent: "space-between", alignItems: "center" },
  cardSub:     { fontSize: "11px", color: C.textoSecundario, flex: 1, marginRight: "6px" },
  badges:      { display: "flex", gap: "4px", alignItems: "center", flexShrink: 0 },
  badge:       { fontSize: "11px", fontWeight: 500, padding: "2px 8px", borderRadius: "10px" },
  badgeEditavel: { fontSize: "12px", color: "#606C38", background: "#f0f4eb", padding: "2px 6px", borderRadius: "6px" },
  editadoAviso: { fontSize: "11px", color: "#92400e", marginTop: "4px" },
}

const ss: Record<string, CSSProperties> = {
  overlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", zIndex: 100 },
  sheet: {
    background: "#fff", borderRadius: "16px 16px 0 0",
    padding: "16px 16px 0", width: "100%", boxSizing: "border-box" as const,
    maxHeight: "88vh", overflowY: "auto" as const,
    paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)",
  },
  handle:       { width: "36px", height: "4px", background: C.borda, borderRadius: "2px", margin: "0 auto 14px" },
  titulo:       { fontSize: "15px", fontWeight: 700, color: C.texto, margin: "0 0 12px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  badgeCancelada: { fontSize: "11px", background: "#fee2e2", color: "#991b1b", padding: "2px 8px", borderRadius: "10px" },
  linhas:       { marginBottom: "12px" },
  linha:        { display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: "13px", borderBottom: `0.5px solid ${C.borda}` },
  lLabel:       { color: C.textoSecundario, flexShrink: 0 },
  lValor:       { color: C.texto, fontWeight: 500, textAlign: "right" as const, maxWidth: "65%", wordBreak: "break-word" as const },
  aviso:        { fontSize: "12px", color: "#92400e", background: "#fef3c7", borderRadius: "8px", padding: "8px 10px", marginBottom: "12px" },
  avisoPerigo:  { fontSize: "13px", color: "#7f1d1d", background: "#fee2e2", borderRadius: "8px", padding: "10px 12px", marginBottom: "14px" },
  avisoSmall:   { fontSize: "12px", color: "#92400e", marginTop: "4px" },
  acoes:        { display: "flex", gap: "8px", marginTop: "12px", marginBottom: "8px" },
  btnEditar:    { flex: 1, background: "#f0f4eb", border: "1.5px solid #606C38", color: "#3a5c1a", borderRadius: "10px", padding: "11px", fontSize: "14px", fontWeight: 500, cursor: "pointer", textAlign: "center" as const },
  btnCancelar:  { flex: 1, background: "#fff", border: "1.5px solid #e5e7eb", color: "#dc2626", borderRadius: "10px", padding: "11px", fontSize: "14px", fontWeight: 500, cursor: "pointer", textAlign: "center" as const },
  btnFechar: {
    display: "block", width: "100%", background: "transparent",
    border: "1.5px solid #EA1D2C", color: "#EA1D2C",
    borderRadius: "10px", padding: "13px", fontSize: "15px",
    fontWeight: 700, cursor: "pointer", textAlign: "center" as const,
    boxSizing: "border-box" as const, marginTop: "8px", marginBottom: "8px",
  },
  campo:        { marginBottom: "12px" },
  campoLabel:   { fontSize: "13px", color: C.textoSecundario, display: "block", marginBottom: "4px" },
  campoInput:   { width: "100%", boxSizing: "border-box" as const, padding: "10px 12px", border: `1px solid ${C.borda}`, borderRadius: "10px", fontSize: "15px", color: C.texto, background: "#fff" },
  erro:         { color: C.erro, fontSize: "13px", margin: "4px 0" },
}
