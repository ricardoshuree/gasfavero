// [mcp-local harness] feature: recebimento-fiado-motorista | plano: 2701b061 | 2026-09-07 13:03:01
// Tela completa de Recebimento de Fiado: busca cliente, lista fiados com badge de atraso, sheet de confirmação com valor editável
// Tela de Recebimento de Fiado — app motorista
// Fluxo: busca cliente → lista fiados em aberto → confirma recebimento (marcar-pago)
// A baixa formal (pago_em) é feita pelo gerente no sistema web.
import { useEffect, useRef, useState, type CSSProperties } from "react"
import { CORES_APP as C } from "../theme"
import type { UserMe } from "../lib/auth"
import {
  buscarClientesFiado,
  buscarMeusFiados,
  diasEmAberto,
  isAtrasado,
  marcarFiadoRecebido,
  type ClienteBusca,
  type FiadoEmAberto,
} from "../lib/fiado"

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

// ---------------------------------------------------------------------------
// Sheet de confirmação de recebimento
// ---------------------------------------------------------------------------
function ConfirmarSheet({
  fiado,
  token,
  onFechar,
  onSucesso,
}: {
  fiado: FiadoEmAberto
  token: string
  onFechar: () => void
  onSucesso: (atualizado: FiadoEmAberto) => void
}) {
  const [valorPago, setValorPago] = useState(fiado.valor_total)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState("")

  async function confirmar() {
    const v = parseFloat(valorPago)
    if (!v || v <= 0) { setErro("Informe o valor recebido."); return }
    if (v > parseFloat(fiado.valor_total)) { setErro("Valor não pode ser maior que o total do fiado."); return }
    setSalvando(true)
    setErro("")
    try {
      const atualizado = await marcarFiadoRecebido(token, fiado.id, valorPago) as FiadoEmAberto
      onSucesso(atualizado)
    } catch (e: any) {
      setErro(e.message ?? "Erro ao registrar recebimento.")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div style={ss.overlay} onClick={onFechar}>
      <div style={ss.sheet} onClick={e => e.stopPropagation()}>
        <div style={ss.handle} />
        <p style={ss.titulo}>Confirmar recebimento</p>

        {/* Resumo do fiado */}
        <div style={ss.resumo}>
          <div style={ss.resumoRow}>
            <span style={ss.rLabel}>Cliente</span>
            <span style={ss.rValor}>{fiado.cliente_nome}</span>
          </div>
          <div style={ss.resumoRow}>
            <span style={ss.rLabel}>Vale nº</span>
            <span style={ss.rValor}>{fiado.vale_numero ?? "—"}</span>
          </div>
          <div style={ss.resumoRow}>
            <span style={ss.rLabel}>Produtos</span>
            <span style={ss.rValor}>{fiado.itens.map(i => `${i.quantidade}× ${i.produto_title}`).join(", ")}</span>
          </div>
          <div style={{ ...ss.resumoRow, borderBottom: "none", fontWeight: 600 }}>
            <span style={ss.rLabel}>Total do fiado</span>
            <span style={{ ...ss.rValor, color: C.texto }}>{formatMoney(fiado.valor_total)}</span>
          </div>
        </div>

        <div style={ss.campo}>
          <label style={ss.campoLabel}>Valor recebido (R$)</label>
          <input
            style={ss.campoInput}
            type="number"
            inputMode="decimal"
            step="0.01"
            value={valorPago}
            onChange={e => { setValorPago(e.target.value); setErro("") }}
            autoFocus
          />
          {parseFloat(valorPago) < parseFloat(fiado.valor_total) && parseFloat(valorPago) > 0 && (
            <p style={ss.avisoSmall}>O cliente está pagando parcialmente. O restante continua em aberto.</p>
          )}
        </div>

        <p style={ss.avisoInfo}>
          A baixa formal será confirmada pelo gerente no sistema web. O valor entra no Malote e no Fechamento do Dia.
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

// ---------------------------------------------------------------------------
// Card de um fiado
// ---------------------------------------------------------------------------
function FiadoCard({
  fiado,
  onReceber,
}: {
  fiado: FiadoEmAberto
  onReceber: (f: FiadoEmAberto) => void
}) {
  const atrasado = isAtrasado(fiado.data_venda)
  const jaRecebido = !!fiado.recebido_em
  const dias = diasEmAberto(fiado.data_venda)

  const borderColor = jaRecebido ? "#606C38" : atrasado ? "#d97706" : "#e5e7eb"

  return (
    <div style={{ ...s.fiadoCard, borderColor }}>
      <div style={s.fiadoHeader}>
        <span style={s.fiadoVale}>Vale nº {fiado.vale_numero ?? "—"}</span>
        {jaRecebido
          ? <span style={{ ...s.badge, background: "#f0f4eb", color: "#3a5c1a" }}>Aguardando baixa</span>
          : atrasado
            ? <span style={{ ...s.badge, background: "#fef3c7", color: "#92400e" }}>⚠ {dias} dias em atraso</span>
            : <span style={{ ...s.badge, background: "#f5f5f5", color: "#6B7280" }}>{dias} dias</span>
        }
      </div>

      <div style={s.linhas}>
        <div style={s.linha}>
          <span style={s.lLabel}>Produtos</span>
          <span style={s.lValor}>{fiado.itens.map(i => `${i.quantidade}× ${i.produto_title}`).join(", ")}</span>
        </div>
        <div style={s.linha}>
          <span style={s.lLabel}>Data da venda</span>
          <span style={s.lValor}>{formatData(fiado.data_venda)}</span>
        </div>
        {fiado.data_pagamento_vale && (
          <div style={s.linha}>
            <span style={s.lLabel}>Vencimento</span>
            <span style={{ ...s.lValor, color: atrasado ? "#dc2626" : C.texto }}>
              {formatData(fiado.data_pagamento_vale)}
            </span>
          </div>
        )}
        <div style={{ ...s.linha, borderBottom: "none", fontWeight: 600, fontSize: "15px" }}>
          <span>Total</span>
          <span>{formatMoney(fiado.valor_total)}</span>
        </div>
      </div>

      {jaRecebido ? (
        <div style={s.avisoAguardando}>
          ✓ Recebimento registrado por {fiado.recebido_por_nome ?? "você"}. Aguardando confirmação do gerente.
        </div>
      ) : (
        <button style={s.btnReceber} onClick={() => onReceber(fiado)}>
          Receber {formatMoney(fiado.valor_total)}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tela principal
// ---------------------------------------------------------------------------
type Modo = "lista_geral" | "cliente_fiados"

export default function RecebimentoFiadoTela({ token, usuario }: Props) {
  const [modo, setModo] = useState<Modo>("lista_geral")
  const [meusFiados, setMeusFiados] = useState<FiadoEmAberto[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState("")

  // Busca de cliente
  const [busca, setBusca] = useState("")
  const [clientes, setClientes] = useState<ClienteBusca[]>([])
  const [buscando, setBuscando] = useState(false)
  const [clienteSelecionado, setClienteSelecionado] = useState<ClienteBusca | null>(null)

  // Sheet de confirmação
  const [fiadoParaReceber, setFiadoParaReceber] = useState<FiadoEmAberto | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    buscarMeusFiados(token, usuario.id)
      .then(setMeusFiados)
      .catch(() => setErro("Não foi possível carregar os fiados."))
      .finally(() => setCarregando(false))
  }, [token, usuario.id])

  // Debounce na busca de clientes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (busca.trim().length < 2) { setClientes([]); return }
    debounceRef.current = setTimeout(() => {
      setBuscando(true)
      buscarClientesFiado(token, busca.trim())
        .then(setClientes)
        .catch(() => setClientes([]))
        .finally(() => setBuscando(false))
    }, 500)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [busca, token])

  function selecionarCliente(c: ClienteBusca) {
    setClienteSelecionado(c)
    setModo("cliente_fiados")
    setBusca("")
    setClientes([])
  }

  function handleSucessoRecebimento(atualizado: FiadoEmAberto) {
    setMeusFiados(prev => prev.map(f => f.id === atualizado.id ? atualizado as FiadoEmAberto : f))
    setFiadoParaReceber(null)
  }

  // Fiados do cliente selecionado (deste motorista)
  const fiadosDoCliente = clienteSelecionado
    ? meusFiados.filter(f => f.cliente_id === clienteSelecionado.id)
    : []

  // Resumo geral
  const fiadosEmAberto = meusFiados.filter(f => !f.recebido_em)
  const totalEmAberto = fiadosEmAberto.reduce((acc, f) => acc + Number(f.valor_total), 0)
  const fiadosAtrasados = fiadosEmAberto.filter(f => isAtrasado(f.data_venda))

  // Contagem de fiados por cliente para mostrar na busca
  function qtdFiadosCliente(clienteId: string) {
    return meusFiados.filter(f => f.cliente_id === clienteId && !f.recebido_em).length
  }

  return (
    <div style={s.pagina}>
      {/* Header com resumo */}
      <div style={s.resumoTopo}>
        <div style={s.resumoCard}>
          <div style={s.resumoLabel}>Em aberto</div>
          <div style={s.resumoValor}>{fiadosEmAberto.length}</div>
        </div>
        <div style={s.resumoCard}>
          <div style={s.resumoLabel}>Total</div>
          <div style={{ ...s.resumoValor, color: fiadosAtrasados.length > 0 ? "#92400e" : C.texto }}>
            {formatMoney(totalEmAberto.toFixed(2))}
          </div>
        </div>
      </div>

      {/* Aviso de atrasos */}
      {fiadosAtrasados.length > 0 && (
        <div style={s.avisoAtraso}>
          ⚠ {fiadosAtrasados.length} fiado(s) em atraso — priorize o recebimento.
        </div>
      )}

      {carregando && <p style={s.info}>Carregando...</p>}
      {erro && <p style={s.erroCentral}>{erro}</p>}

      {!carregando && modo === "lista_geral" && (
        <>
          {/* Campo de busca */}
          <div style={s.searchBox}>
            <span style={s.searchIcon}>🔍</span>
            <input
              style={s.searchInput}
              placeholder="Buscar cliente por nome ou CPF..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
            {busca && (
              <button style={s.clearBtn} onClick={() => { setBusca(""); setClientes([]) }}>✕</button>
            )}
          </div>

          {/* Resultados da busca */}
          {buscando && <p style={s.info}>Buscando...</p>}
          {clientes.length > 0 && (
            <div style={s.lista}>
              {clientes.map(c => {
                const qtd = qtdFiadosCliente(c.id)
                return (
                  <div key={c.id} style={s.clienteCard} onClick={() => selecionarCliente(c)}>
                    <div style={s.clienteNome}>{c.nome}</div>
                    <div style={s.clienteSub}>
                      CPF {c.cpf}
                      {qtd > 0
                        ? <span style={s.qtdBadge}> · {qtd} fiado{qtd > 1 ? "s" : ""} em aberto</span>
                        : <span style={{ color: "#9ca3af" }}> · sem fiados em aberto</span>
                      }
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {busca.trim().length >= 2 && !buscando && clientes.length === 0 && (
            <p style={s.info}>Nenhum cliente encontrado.</p>
          )}

          {/* Lista geral dos meus fiados (quando não há busca ativa) */}
          {!busca && (
            <div style={s.lista}>
              {meusFiados.length === 0 ? (
                <div style={s.vazio}>
                  <p style={s.vazioTitulo}>Nenhum fiado em aberto</p>
                  <p style={s.vazioSub}>Todos os fiados foram recebidos.</p>
                </div>
              ) : (
                meusFiados.map(f => (
                  <FiadoCard
                    key={f.id}
                    fiado={f}
                    onReceber={setFiadoParaReceber}
                  />
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* Modo: fiados do cliente selecionado */}
      {!carregando && modo === "cliente_fiados" && clienteSelecionado && (
        <>
          <div style={s.clienteHeader}>
            <button style={s.btnVoltar} onClick={() => { setModo("lista_geral"); setClienteSelecionado(null) }}>
              ← Voltar
            </button>
            <span style={s.clienteHeaderNome}>{clienteSelecionado.nome}</span>
          </div>
          <div style={s.lista}>
            {fiadosDoCliente.length === 0 ? (
              <div style={s.vazio}>
                <p style={s.vazioTitulo}>Nenhum fiado em aberto</p>
                <p style={s.vazioSub}>Este cliente não tem fiados com você.</p>
              </div>
            ) : (
              fiadosDoCliente.map(f => (
                <FiadoCard
                  key={f.id}
                  fiado={f}
                  onReceber={setFiadoParaReceber}
                />
              ))
            )}
          </div>
        </>
      )}

      {/* Sheet de confirmação */}
      {fiadoParaReceber && (
        <ConfirmarSheet
          fiado={fiadoParaReceber}
          token={token}
          onFechar={() => setFiadoParaReceber(null)}
          onSucesso={handleSucessoRecebimento}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------
const s: Record<string, CSSProperties> = {
  pagina: { background: C.fundo, minHeight: "100%", paddingBottom: "80px" },
  resumoTopo: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", padding: "10px 14px" },
  resumoCard: { background: C.fundoCard, borderRadius: "10px", padding: "10px 12px" },
  resumoLabel: { fontSize: "11px", color: C.textoSecundario, marginBottom: "3px" },
  resumoValor: { fontSize: "18px", fontWeight: 700, color: C.texto },
  avisoAtraso: { margin: "0 14px 10px", background: "#fef3c7", border: "1px solid #d97706", borderRadius: "10px", padding: "8px 12px", fontSize: "13px", color: "#92400e" },
  info: { textAlign: "center" as const, color: C.textoSecundario, fontSize: "14px", padding: "0.75rem" },
  erroCentral: { color: C.erro, fontSize: "13px", textAlign: "center" as const, padding: "0.5rem 1rem" },
  searchBox: { display: "flex", alignItems: "center", gap: "8px", background: C.fundoCard, border: `1px solid ${C.borda}`, borderRadius: "10px", padding: "10px 12px", margin: "0 14px 10px" },
  searchIcon: { fontSize: "16px" },
  searchInput: { border: "none", background: "transparent", fontSize: "14px", color: C.texto, flex: 1, outline: "none" },
  clearBtn: { background: "none", border: "none", fontSize: "14px", color: C.textoSecundario, cursor: "pointer", padding: 0 },
  lista: { padding: "0 14px" },
  clienteCard: { background: "#fff", border: `1px solid ${C.borda}`, borderRadius: "12px", padding: "12px", marginBottom: "8px", cursor: "pointer" },
  clienteNome: { fontSize: "14px", fontWeight: 600, color: C.texto },
  clienteSub: { fontSize: "12px", color: C.textoSecundario, marginTop: "2px" },
  qtdBadge: { color: "#92400e", fontWeight: 600 },
  clienteHeader: { display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px 6px" },
  btnVoltar: { background: "none", border: "none", color: "#606C38", fontSize: "14px", cursor: "pointer", padding: 0 },
  clienteHeaderNome: { fontSize: "15px", fontWeight: 700, color: C.texto },
  fiadoCard: { background: "#fff", border: "2px solid", borderRadius: "12px", padding: "12px 14px", marginBottom: "10px" },
  fiadoHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" },
  fiadoVale: { fontSize: "14px", fontWeight: 700, color: C.texto },
  badge: { fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "8px" },
  linhas: { marginBottom: "8px" },
  linha: { display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: "13px", borderBottom: `0.5px solid ${C.borda}` },
  lLabel: { color: C.textoSecundario },
  lValor: { color: C.texto, fontWeight: 500, textAlign: "right" as const },
  btnReceber: { display: "block", width: "100%", background: "#606C38", color: "#F8FAFC", border: "none", borderRadius: "12px", padding: "12px", fontSize: "15px", fontWeight: 600, cursor: "pointer", textAlign: "center" as const, boxSizing: "border-box" as const },
  avisoAguardando: { background: "#f0f4eb", border: "1px solid #606C38", borderRadius: "8px", padding: "8px 10px", fontSize: "12px", color: "#3a5c1a" },
  vazio: { textAlign: "center" as const, padding: "2rem 0" },
  vazioTitulo: { fontSize: "15px", fontWeight: 600, color: C.texto, margin: "0 0 4px" },
  vazioSub: { fontSize: "13px", color: C.textoSecundario, margin: 0 },
}

const ss: Record<string, CSSProperties> = {
  overlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", zIndex: 100 },
  sheet: { background: "#fff", borderRadius: "16px 16px 0 0", padding: "16px", width: "100%", boxSizing: "border-box" as const, maxHeight: "85vh", overflowY: "auto" as const },
  handle: { width: "36px", height: "4px", background: C.borda, borderRadius: "2px", margin: "0 auto 14px" },
  titulo: { fontSize: "15px", fontWeight: 700, color: C.texto, margin: "0 0 12px" },
  resumo: { background: C.fundoCard, borderRadius: "10px", padding: "10px 12px", marginBottom: "14px" },
  resumoRow: { display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: "13px", borderBottom: `0.5px solid ${C.borda}` },
  rLabel: { color: C.textoSecundario },
  rValor: { color: C.texto, fontWeight: 500, textAlign: "right" as const },
  campo: { marginBottom: "10px" },
  campoLabel: { display: "block", fontSize: "13px", color: C.textoSecundario, marginBottom: "4px" },
  campoInput: { width: "100%", boxSizing: "border-box" as const, padding: "12px", border: `1px solid ${C.borda}`, borderRadius: "10px", fontSize: "18px", color: C.texto, background: "#fff", fontWeight: 600, outline: "none" },
  avisoSmall: { fontSize: "12px", color: "#92400e", margin: "4px 0 0" },
  avisoInfo: { fontSize: "12px", color: C.textoSecundario, margin: "0 0 12px", lineHeight: "1.5" },
  erro: { color: C.erro, fontSize: "13px", margin: "4px 0" },
  acoes: { display: "flex", gap: "8px" },
  btnVoltar: { flex: 1, background: "transparent", border: `1px solid ${C.borda}`, color: C.texto, borderRadius: "10px", padding: "13px", fontSize: "14px", cursor: "pointer" },
  btnConfirmar: { flex: 2, background: "#606C38", color: "#F8FAFC", border: "none", borderRadius: "10px", padding: "13px", fontSize: "15px", fontWeight: 600, cursor: "pointer" },
}
