// [mcp-local harness] feature: historico-vendas-cliente-layout | plano: 69cff08b | 2026-09-07 19:37:52
// EtapaCliente: histórico com 2 linhas (data+valor+status / produtos+forma+endereço), aviso de casco em aberto, vale_numero na sublinha
// Etapa 2 — Busca de cliente, cadastro rápido, troca de endereço e histórico de vendas
import { useEffect, useRef, useState, type CSSProperties } from "react"
import { CORES_APP as C } from "../../theme"
import {
  buscarBairros,
  buscarClientes,
  cadastrarCliente,
  type Bairro,
  type Cliente,
} from "../../lib/vendas"
import { request } from "../../lib/api"

interface Props {
  token: string
  clienteSelecionado: Cliente | null
  enderecoId: string | null
  onClienteChange: (c: Cliente | null) => void
  onEnderecoChange: (id: string | null) => void
  onProximo: () => void
  onVoltar: () => void
}

type ModoCliente = "busca" | "novo"

// Tipo completo retornado pelo endpoint /historico (VendaPublic)
type VendaHistorico = {
  id: string
  data_venda: string
  valor_pago: string
  forma_pagamento: string
  vale_numero: number | null
  pago_em: string | null
  recebido_em: string | null
  status: string
  itens: Array<{ produto_title: string; quantidade: number }>
  endereco: {
    rua_nome: string
    numero: string
    bairro_nome: string
    complemento?: string | null
  } | null
}

type CascoCliente = {
  count: number
  total_cascos_abertos: number
}

const DIAS_ATRASO = 30

const LABEL_FORMA: Record<string, string> = {
  cartao_debito:  "Débito",
  cartao_credito: "Crédito",
  pix:            "Pix",
  dinheiro:       "Dinheiro",
  vale:           "Fiado",
  vale_gas:       "Vale Gás",
  gas_povo:       "Gás do Povo",
}

function statusVenda(v: VendaHistorico): { label: string; bg: string; text: string } {
  if (v.status === "cancelada") return { label: "Cancelada", bg: "#fee2e2", text: "#991b1b" }
  if (v.forma_pagamento !== "vale") return { label: "Pago", bg: "#f0f4eb", text: "#3a5c1a" }
  if (v.pago_em) return { label: "Baixado", bg: "#f0f4eb", text: "#3a5c1a" }
  if (v.recebido_em) return { label: "Aguard. baixa", bg: "#e0f2fe", text: "#0369a1" }
  const dataVenda = new Date(`${v.data_venda}T00:00:00`)
  const limite = new Date(); limite.setHours(0,0,0,0); limite.setDate(limite.getDate() - DIAS_ATRASO)
  if (dataVenda <= limite) return { label: "Em atraso", bg: "#fee2e2", text: "#991b1b" }
  return { label: "Em aberto", bg: "#fef3c7", text: "#92400e" }
}

function formatData(iso: string) {
  const [, m, d] = iso.split("-")
  return `${d}/${m}`
}

function formatMoney(v: string | number) {
  return `R$ ${Number(v).toFixed(2).replace(".", ",")}`
}

function enderecoStr(end: VendaHistorico["endereco"]): string {
  if (!end) return ""
  const comp = end.complemento ? ` (${end.complemento})` : ""
  return `${end.rua_nome}, ${end.numero}${comp}`
}

// ---------------------------------------------------------------------------
// Aviso de casco em aberto
// ---------------------------------------------------------------------------
function AvisoCasco({ clienteId, token }: { clienteId: string; token: string }) {
  const [total, setTotal] = useState(0)

  useEffect(() => {
    request<CascoCliente>(`/api/v1/cascos/cliente/${clienteId}`, { token })
      .then(r => setTotal(r.total_cascos_abertos))
      .catch(() => {})
  }, [clienteId, token])

  if (total === 0) return null

  return (
    <div style={sh.avisoCasco}>
      📦 ⚠️ Este cliente tem <strong>{total} casco{total > 1 ? "s" : ""} emprestado{total > 1 ? "s" : ""} em aberto</strong>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Histórico de vendas — 2 linhas por venda
// ---------------------------------------------------------------------------
function HistoricoVendas({ clienteId, token }: { clienteId: string; token: string }) {
  const [vendas, setVendas] = useState<VendaHistorico[]>([])

  useEffect(() => {
    request<{ data: VendaHistorico[] }>(
      `/api/v1/vendas/cliente/${clienteId}/historico?limit=3`,
      { token }
    ).then(r => setVendas(r.data)).catch(() => {})
  }, [clienteId, token])

  if (vendas.length === 0) return null

  return (
    <div style={sh.box}>
      <p style={sh.titulo}>Histórico de vendas (últimas 3)</p>
      {vendas.map(v => {
        const st = statusVenda(v)
        const produtos = v.itens.map(i => `${i.quantidade}× ${i.produto_title}`).join(", ")
        const forma = LABEL_FORMA[v.forma_pagamento] ?? v.forma_pagamento
        const numeroVale = v.vale_numero ? ` · Folha ${v.vale_numero}` : ""
        const end = enderecoStr(v.endereco)
        const subLinha = [produtos, forma + numeroVale, end].filter(Boolean).join(" · ")

        return (
          <div key={v.id} style={sh.card}>
            {/* Linha 1: data · valor · status */}
            <div style={sh.linha1}>
              <span style={sh.data}>{formatData(v.data_venda)}</span>
              <span style={sh.valor}>{formatMoney(v.valor_pago)}</span>
              <span style={{ ...sh.badge, background: st.bg, color: st.text }}>{st.label}</span>
            </div>
            {/* Linha 2: produtos · forma · endereço */}
            <div style={sh.linha2} title={subLinha}>
              {subLinha}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const sh: Record<string, CSSProperties> = {
  box:       { background: C.fundoCard, border: `1px solid ${C.borda}`, borderRadius: "10px", padding: "10px 12px", marginTop: "10px" },
  titulo:    { fontSize: "11px", fontWeight: 700, color: C.textoSecundario, textTransform: "uppercase" as const, letterSpacing: "0.5px", margin: "0 0 6px" },
  card:      { borderTop: `0.5px solid ${C.borda}`, padding: "7px 0 4px" },
  linha1:    { display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" },
  data:      { fontSize: "12px", color: C.textoSecundario, flexShrink: 0, minWidth: "36px" },
  valor:     { fontSize: "13px", fontWeight: 700, color: C.texto, flexShrink: 0 },
  badge:     { fontSize: "10px", fontWeight: 600, padding: "2px 6px", borderRadius: "6px", marginLeft: "auto", whiteSpace: "nowrap" as const },
  linha2:    { fontSize: "11px", color: C.textoSecundario, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, paddingLeft: "2px" },
  avisoCasco:{ background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: "8px", padding: "7px 10px", fontSize: "12px", color: "#92400e", marginTop: "8px", lineHeight: "1.4" },
}

// ---------------------------------------------------------------------------
// Troca de endereço inline
// ---------------------------------------------------------------------------
function TrocarEndereco({
  token, clienteId, onEnderecoCriado, onFechar,
}: {
  token: string
  clienteId: string
  onEnderecoCriado: (novoEnderecoId: string, novoEnderecoStr: string) => void
  onFechar: () => void
}) {
  const [bairros, setBairros] = useState<Bairro[]>([])
  const [bairroId, setBairroId] = useState("")
  const [rua, setRua] = useState("")
  const [numero, setNumero] = useState("")
  const [complemento, setComplemento] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState("")

  useEffect(() => { buscarBairros(token).then(setBairros).catch(() => {}) }, [token])

  async function salvar() {
    if (!bairroId || !rua.trim() || !numero.trim()) { setErro("Bairro, rua e número são obrigatórios."); return }
    setSalvando(true); setErro("")
    try {
      const atualizado = await request<Cliente>(`/api/v1/clientes/${clienteId}`, {
        method: "PATCH", token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endereco: { bairro_id: bairroId, rua_nome: rua.trim(), numero: numero.trim(), complemento: complemento.trim() || undefined }
        }),
      })
      const endId = atualizado.endereco?.id ?? ""
      const endStr = atualizado.endereco
        ? `${atualizado.endereco.rua_nome}, ${atualizado.endereco.numero} — ${atualizado.endereco.bairro_nome}`
        : ""
      onEnderecoCriado(endId, endStr)
    } catch (e: any) {
      setErro(e.message ?? "Erro ao salvar endereço.")
    } finally { setSalvando(false) }
  }

  return (
    <div style={se.box}>
      <p style={se.titulo}>Novo endereço</p>
      <label style={se.label}>Bairro *</label>
      <select style={se.input} value={bairroId} onChange={e => setBairroId(e.target.value)}>
        <option value="">Selecione...</option>
        {bairros.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
      </select>
      <label style={se.label}>Rua *</label>
      <input style={se.input} value={rua} onChange={e => setRua(e.target.value)} placeholder="Nome da rua" />
      <div style={{ display: "flex", gap: "8px" }}>
        <div style={{ flex: 1 }}>
          <label style={se.label}>Número *</label>
          <input style={se.input} value={numero} onChange={e => setNumero(e.target.value)} placeholder="123" inputMode="numeric" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={se.label}>Complemento</label>
          <input style={se.input} value={complemento} onChange={e => setComplemento(e.target.value)} placeholder="Apto..." />
        </div>
      </div>
      {erro && <p style={{ color: C.erro, fontSize: "12px", margin: "4px 0" }}>{erro}</p>}
      <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
        <button style={se.btnCancelar} onClick={onFechar}>Cancelar</button>
        <button style={se.btnSalvar} onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar endereço"}
        </button>
      </div>
    </div>
  )
}

const se: Record<string, CSSProperties> = {
  box:        { background: "#f0f4eb", border: "1.5px solid #606C38", borderRadius: "10px", padding: "12px", marginTop: "8px" },
  titulo:     { fontSize: "13px", fontWeight: 700, color: "#3a5c1a", margin: "0 0 8px" },
  label:      { fontSize: "12px", color: C.textoSecundario, display: "block", marginBottom: "3px", marginTop: "6px" },
  input:      { width: "100%", boxSizing: "border-box" as const, padding: "9px 12px", border: `1px solid ${C.borda}`, borderRadius: "8px", fontSize: "14px", color: C.texto, background: "#fff", marginBottom: "2px" },
  btnCancelar:{ flex: 1, background: "transparent", border: `1px solid ${C.borda}`, color: C.texto, borderRadius: "8px", padding: "10px", fontSize: "13px", cursor: "pointer" },
  btnSalvar:  { flex: 2, background: "#606C38", color: "#F8FAFC", border: "none", borderRadius: "8px", padding: "10px", fontSize: "13px", fontWeight: 600, cursor: "pointer" },
}

// ---------------------------------------------------------------------------
// EtapaCliente principal
// ---------------------------------------------------------------------------
export default function EtapaCliente({
  token, clienteSelecionado,
  onClienteChange, onEnderecoChange, onProximo, onVoltar
}: Props) {
  const [modo, setModo] = useState<ModoCliente>("busca")
  const [busca, setBusca] = useState("")
  const [resultados, setResultados] = useState<Cliente[]>([])
  const [buscando, setBuscando] = useState(false)
  const [bairros, setBairros] = useState<Bairro[]>([])
  const [enderecoStr, setEnderecoStr] = useState("")
  const [mostrarTrocarEnd, setMostrarTrocarEnd] = useState(false)

  const [nome, setNome] = useState("")
  const [cpf, setCpf] = useState("")
  const [tel, setTel] = useState("")
  const [bairroId, setBairroId] = useState("")
  const [ruaNome, setRuaNome] = useState("")
  const [numero, setNumero] = useState("")
  const [complemento, setComplemento] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [erroCadastro, setErroCadastro] = useState("")

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { buscarBairros(token).then(setBairros).catch(() => {}) }, [token])

  useEffect(() => {
    if (!clienteSelecionado) { setEnderecoStr(""); return }
    request<{ rua_nome: string; numero: string; bairro_nome: string; id: string } | null>(
      `/api/v1/vendas/cliente/${clienteSelecionado.id}/ultimo-endereco`, { token }
    ).then(end => {
      if (end) {
        onEnderecoChange(end.id)
        setEnderecoStr(`${end.rua_nome}, ${end.numero} — ${end.bairro_nome}`)
      } else if (clienteSelecionado.endereco) {
        onEnderecoChange(clienteSelecionado.endereco.id)
        setEnderecoStr(`${clienteSelecionado.endereco.rua_nome}, ${clienteSelecionado.endereco.numero} — ${clienteSelecionado.endereco.bairro_nome}`)
      } else {
        onEnderecoChange(null); setEnderecoStr("")
      }
    }).catch(() => {
      if (clienteSelecionado.endereco) {
        onEnderecoChange(clienteSelecionado.endereco.id)
        setEnderecoStr(`${clienteSelecionado.endereco.rua_nome}, ${clienteSelecionado.endereco.numero} — ${clienteSelecionado.endereco.bairro_nome}`)
      }
    })
  }, [clienteSelecionado?.id])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (busca.trim().length < 2) { setResultados([]); return }
    debounceRef.current = setTimeout(() => {
      setBuscando(true)
      buscarClientes(token, busca.trim())
        .then(setResultados).catch(() => setResultados([]))
        .finally(() => setBuscando(false))
    }, 500)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [busca, token])

  async function handleCadastrar() {
    if (!nome.trim() || !cpf.trim()) { setErroCadastro("Nome e CPF são obrigatórios."); return }
    setSalvando(true); setErroCadastro("")
    try {
      const c = await cadastrarCliente(token, {
        nome: nome.trim(),
        cpf: cpf.trim().replace(/\D/g, ""),
        telefone: tel.trim() || undefined,
        endereco: ruaNome.trim() && numero.trim() && bairroId
          ? { bairro_id: bairroId, rua_nome: ruaNome.trim(), numero: numero.trim(), complemento: complemento.trim() || undefined }
          : undefined,
      })
      onClienteChange(c)
      if (c.endereco?.id) onEnderecoChange(c.endereco.id)
      setModo("busca")
    } catch (e: any) {
      setErroCadastro(e.message ?? "Erro ao cadastrar cliente.")
    } finally { setSalvando(false) }
  }

  function selecionarCliente(c: Cliente) {
    onClienteChange(c); setBusca(""); setResultados([])
  }

  function formatarEndereco(c: Cliente) {
    if (!c.endereco) return "Sem endereço"
    return `${c.endereco.rua_nome}, ${c.endereco.numero} — ${c.endereco.bairro_nome}`
  }

  return (
    <div style={s.pagina}>
      {modo === "busca" && (
        <>
          {clienteSelecionado && (
            <div style={s.clienteCard}>
              <div style={s.clienteNome}>{clienteSelecionado.nome}</div>
              <div style={s.clienteSub}>CPF {clienteSelecionado.cpf}</div>

              {/* Aviso casco em aberto */}
              <AvisoCasco clienteId={clienteSelecionado.id} token={token} />

              <div style={s.enderecoRow}>
                <span style={s.enderecoTxt}>📍 {enderecoStr || "Sem endereço"}</span>
                <button style={s.btnTrocarEnd} onClick={() => setMostrarTrocarEnd(p => !p)}>
                  {mostrarTrocarEnd ? "Cancelar" : "Trocar"}
                </button>
              </div>

              {mostrarTrocarEnd && (
                <TrocarEndereco
                  token={token}
                  clienteId={clienteSelecionado.id}
                  onEnderecoCriado={(id, str) => { onEnderecoChange(id); setEnderecoStr(str); setMostrarTrocarEnd(false) }}
                  onFechar={() => setMostrarTrocarEnd(false)}
                />
              )}

              <HistoricoVendas clienteId={clienteSelecionado.id} token={token} />

              <button style={s.btnTrocar} onClick={() => { onClienteChange(null); onEnderecoChange(null); setEnderecoStr("") }}>
                Trocar cliente
              </button>
            </div>
          )}

          {!clienteSelecionado && (
            <>
              <div style={s.searchBox}>
                <span style={s.searchIcon}>🔍</span>
                <input
                  style={s.searchInput}
                  placeholder="Buscar por nome ou CPF..."
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  autoFocus
                />
                {busca && <button style={s.clearBtn} onClick={() => { setBusca(""); setResultados([]) }}>✕</button>}
              </div>
              {buscando && <p style={s.info}>Buscando...</p>}
              {resultados.map(c => (
                <div key={c.id} style={s.resultado} onClick={() => selecionarCliente(c)}>
                  <div style={s.resNome}>{c.nome}</div>
                  <div style={s.resSub}>CPF {c.cpf} · {formatarEndereco(c)}</div>
                </div>
              ))}
              {busca.trim().length >= 2 && !buscando && resultados.length === 0 && (
                <p style={s.info}>Nenhum cliente encontrado.</p>
              )}
            </>
          )}

          <div style={s.separator} />
          <button style={s.btnNovo} onClick={() => setModo("novo")}>+ Cadastrar novo cliente</button>

          <div style={s.rodape}>
            <button style={s.btnVoltar} onClick={onVoltar}>← Voltar</button>
            <button
              style={{ ...s.btnProximo, opacity: clienteSelecionado ? 1 : 0.4 }}
              disabled={!clienteSelecionado}
              onClick={onProximo}
            >
              Próximo →
            </button>
          </div>
        </>
      )}

      {modo === "novo" && (
        <div style={s.form}>
          <p style={s.formTitulo}>Novo cliente</p>
          <label style={s.label}>Nome *</label>
          <input style={s.input} value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo" />
          <label style={s.label}>CPF *</label>
          <input style={s.input} value={cpf} onChange={e => setCpf(e.target.value)} placeholder="000.000.000-00" inputMode="numeric" />
          <label style={s.label}>Telefone</label>
          <input style={s.input} value={tel} onChange={e => setTel(e.target.value)} placeholder="(54) 9..." inputMode="tel" />
          <p style={s.secao}>Endereço (opcional)</p>
          <label style={s.label}>Bairro</label>
          <select style={s.input} value={bairroId} onChange={e => setBairroId(e.target.value)}>
            <option value="">Selecione...</option>
            {bairros.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
          <label style={s.label}>Rua</label>
          <input style={s.input} value={ruaNome} onChange={e => setRuaNome(e.target.value)} placeholder="Nome da rua" />
          <div style={s.rowDois}>
            <div style={{ flex: 1 }}>
              <label style={s.label}>Número</label>
              <input style={s.input} value={numero} onChange={e => setNumero(e.target.value)} placeholder="123" inputMode="numeric" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={s.label}>Complemento</label>
              <input style={s.input} value={complemento} onChange={e => setComplemento(e.target.value)} placeholder="Apto..." />
            </div>
          </div>
          {erroCadastro && <p style={s.erro}>{erroCadastro}</p>}
          <div style={s.rodape}>
            <button style={s.btnVoltar} onClick={() => setModo("busca")}>← Cancelar</button>
            <button style={s.btnProximo} onClick={handleCadastrar} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar →"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const s: Record<string, CSSProperties> = {
  pagina:      { padding: "0.75rem 1rem 1.5rem" },
  info:        { color: C.textoSecundario, fontSize: "0.85rem", textAlign: "center", padding: "0.75rem 0" },
  searchBox:   { display: "flex", alignItems: "center", gap: "8px", background: C.fundoCard, border: `1px solid ${C.borda}`, borderRadius: "10px", padding: "10px 12px", marginBottom: "8px" },
  searchIcon:  { fontSize: "16px" },
  searchInput: { border: "none", background: "transparent", fontSize: "15px", color: C.texto, flex: 1, outline: "none" },
  clearBtn:    { background: "none", border: "none", fontSize: "14px", color: C.textoSecundario, cursor: "pointer", padding: 0 },
  resultado:   { background: C.fundoCard, border: `1px solid ${C.borda}`, borderRadius: "10px", padding: "12px", marginBottom: "6px", cursor: "pointer" },
  resNome:     { fontSize: "14px", fontWeight: 600, color: C.texto },
  resSub:      { fontSize: "12px", color: C.textoSecundario, marginTop: "2px" },
  clienteCard: { background: "#f0f4eb", border: "2px solid #606C38", borderRadius: "12px", padding: "12px 14px", marginBottom: "12px" },
  clienteNome: { fontSize: "15px", fontWeight: 700, color: C.texto },
  clienteSub:  { fontSize: "12px", color: C.textoSecundario, marginTop: "2px" },
  enderecoRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "8px", gap: "8px" },
  enderecoTxt: { fontSize: "12px", color: C.textoSecundario, flex: 1 },
  btnTrocarEnd:{ background: "transparent", border: `1px solid #606C38`, color: "#606C38", borderRadius: "6px", padding: "3px 10px", fontSize: "12px", cursor: "pointer", flexShrink: 0 },
  btnTrocar:   { marginTop: "10px", background: "transparent", border: `1px solid #606C38`, color: "#606C38", borderRadius: "8px", padding: "6px 12px", fontSize: "13px", cursor: "pointer", display: "block", width: "100%", textAlign: "center" as const },
  separator:   { borderTop: `1px solid ${C.borda}`, margin: "12px 0" },
  btnNovo:     { width: "100%", background: "transparent", border: `1.5px solid ${C.borda}`, borderRadius: "12px", padding: "12px", fontSize: "15px", color: C.texto, cursor: "pointer", textAlign: "center" as const },
  rodape:      { display: "flex", gap: "10px", marginTop: "16px" },
  btnVoltar:   { flex: 1, background: "transparent", border: `1px solid ${C.borda}`, borderRadius: "12px", padding: "13px", fontSize: "15px", color: C.texto, cursor: "pointer" },
  btnProximo:  { flex: 2, background: "#606C38", color: "#F8FAFC", border: "none", borderRadius: "12px", padding: "13px", fontSize: "15px", fontWeight: 600, cursor: "pointer" },
  form:        { display: "flex", flexDirection: "column", gap: "4px" },
  formTitulo:  { fontSize: "16px", fontWeight: 700, color: C.texto, margin: "0 0 8px" },
  secao:       { fontSize: "13px", fontWeight: 600, color: C.textoSecundario, margin: "8px 0 4px" },
  label:       { fontSize: "13px", color: C.textoSecundario, marginBottom: "2px" },
  input:       { width: "100%", boxSizing: "border-box" as const, padding: "10px 12px", border: `1px solid ${C.borda}`, borderRadius: "10px", fontSize: "15px", color: C.texto, background: C.fundoCardInterno, marginBottom: "6px", outline: "none" },
  rowDois:     { display: "flex", gap: "8px" },
  erro:        { color: C.erro, fontSize: "13px", margin: "4px 0" },
}
