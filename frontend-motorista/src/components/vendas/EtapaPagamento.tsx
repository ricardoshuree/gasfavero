// [mcp-local harness] feature: pagamento-mix | plano: 72b46394 | 2026-09-13 14:37:57
// EtapaPagamento reescrita com modo único e mix. Gás do Povo exclusivo. Fiado no mix pede folha+vencimento. Resumo do mix com validação de cobertura.
// EtapaPagamento — suporte a mix de formas de pagamento
//
// REGRAS:
// - Gás do Povo: exclusivo, nunca entra em mix
// - Vale Gás: não disponível no app mobile
// - Fiado: pode ser único ou entrar no mix com outras formas
// - Mix: qualquer combinação de pix/dinheiro/débito/crédito/fiado
//   - cada forma tem seu valor parcial
//   - soma deve cobrir o total da sacola
//   - fiado no mix pede número da folha + data de vencimento
// - Forma única (não mix): valor total da sacola, campos específicos por forma
import { useState, type CSSProperties } from "react"
import { CORES_APP as C } from "../../theme"
import { type DadosPagamento, type FormaPagamento } from "../../lib/vendas"

const VERDE = "#606C38"
const VERMELHO = "#EA1D2C"

// Formas disponíveis no app mobile (sem Vale Gás)
// Gás do Povo é exclusivo (sem mix)
type FormaId = "pix" | "dinheiro" | "cartao_debito" | "cartao_credito" | "vale" | "gas_povo"

const FORMAS_MIX: { id: FormaId; label: string; icone: string }[] = [
  { id: "pix",            label: "Pix",     icone: "📲" },
  { id: "dinheiro",       label: "Dinheiro", icone: "💵" },
  { id: "cartao_debito",  label: "Débito",  icone: "💳" },
  { id: "cartao_credito", label: "Crédito", icone: "💳" },
  { id: "vale",           label: "Fiado",   icone: "🧾" },
]

// Data padrão: 5º dia útil do mês seguinte (mesma lógica do ERP)
function proximoVencimentoPadrao(): string {
  const hoje = new Date()
  const mes = hoje.getMonth() + 1 // mês seguinte
  const ano = mes === 12 ? hoje.getFullYear() + 1 : hoje.getFullYear()
  const mesAdj = mes === 12 ? 1 : mes + 1
  // 5º dia útil aproximado — usa dia 8 como proxy conservador (igual ao ERP)
  const d = new Date(ano, mesAdj - 1, 8)
  return d.toISOString().slice(0, 10)
}

type EntradaMix = {
  forma: FormaId
  valor: string
  valeNumero?: string
  dataPagamentoVale?: string
}

interface Props {
  pagamento: DadosPagamento | null
  totalSacola: number
  onPagamentoChange: (p: DadosPagamento) => void
  onVoltar: () => void
  onProximo: () => void
}

export default function EtapaPagamento({
  pagamento, totalSacola, onPagamentoChange, onVoltar, onProximo,
}: Props) {
  // Modo: "unica" (1 forma) ou "mix" (>1)
  const [modo, setModo] = useState<"unica" | "mix">("unica")

  // Forma única
  const [formaUnica, setFormaUnica] = useState<FormaId | null>(
    (pagamento?.forma as FormaId) ?? null
  )
  const [valorUnico, setValorUnico] = useState(
    pagamento?.valorPago ?? String(totalSacola.toFixed(2))
  )
  const [valeNumUnico, setValeNumUnico] = useState(pagamento?.valeNumero ?? "")
  const [vencUnico, setVencUnico] = useState(
    pagamento?.dataPagamentoVale ?? proximoVencimentoPadrao()
  )
  const [gasPovoValorGov, setGasPovoValorGov] = useState(pagamento?.gasPovoValorGov ?? "")
  const [gasPovoFrete, setGasPovoFrete] = useState(pagamento?.gasPovoFrete ?? "")

  // Mix
  const [entradas, setEntradas] = useState<EntradaMix[]>([])

  // ── Validações ─────────────────────────────────────────────────────────────

  const totalMix = entradas.reduce((acc, e) => acc + (parseFloat(e.valor) || 0), 0)
  const faltaMix = Math.max(0, totalSacola - totalMix)
  const mixCobre = totalMix >= totalSacola - 0.01
  const mixTemFiadoSemFolha = entradas.some(e => e.forma === "vale" && !e.valeNumero?.trim())
  const mixValido = entradas.length >= 2 && mixCobre && !mixTemFiadoSemFolha

  function podeProximoUnica(): boolean {
    if (!formaUnica) return false
    if (formaUnica === "vale") return valeNumUnico.trim().length > 0
    if (formaUnica === "gas_povo") return parseFloat(gasPovoValorGov) > 0 && parseFloat(gasPovoFrete) > 0
    return true
  }

  // ── Handlers forma única ───────────────────────────────────────────────────

  function selecionarFormaUnica(f: FormaId) {
    setFormaUnica(f)
    setValorUnico(String(totalSacola.toFixed(2)))
    setValeNumUnico("")
    setVencUnico(proximoVencimentoPadrao())
    setGasPovoValorGov(""); setGasPovoFrete("")
    // Ao selecionar Gas do Povo, sai do modo mix
    if (f === "gas_povo") setModo("unica")
  }

  function confirmarUnica() {
    if (!formaUnica) return
    const dados: DadosPagamento = {
      forma: formaUnica as FormaPagamento,
      valorPago: formaUnica === "gas_povo" ? gasPovoValorGov : valorUnico,
      valeNumero: formaUnica === "vale" ? valeNumUnico : undefined,
      dataPagamentoVale: formaUnica === "vale" ? vencUnico : undefined,
      gasPovoValorGov: formaUnica === "gas_povo" ? gasPovoValorGov : undefined,
      gasPovoFrete: formaUnica === "gas_povo" ? gasPovoFrete : undefined,
    }
    onPagamentoChange(dados)
    onProximo()
  }

  // ── Handlers mix ───────────────────────────────────────────────────────────

  function toggleFormaMix(f: FormaId) {
    const existe = entradas.find(e => e.forma === f)
    if (existe) {
      setEntradas(entradas.filter(e => e.forma !== f))
    } else {
      // Distribuir o valor restante para a nova forma
      const resto = Math.max(0, totalSacola - totalMix)
      setEntradas([...entradas, {
        forma: f,
        valor: resto > 0 ? String(resto.toFixed(2)) : "",
        valeNumero: "",
        dataPagamentoVale: proximoVencimentoPadrao(),
      }])
    }
  }

  function atualizarEntrada(f: FormaId, patch: Partial<EntradaMix>) {
    setEntradas(entradas.map(e => e.forma === f ? { ...e, ...patch } : e))
  }

  function confirmarMix() {
    if (!mixValido) return
    const pagamentos = entradas.map(e => ({
      forma_pagamento: e.forma,
      valor: parseFloat(e.valor),
      vale_numero: e.forma === "vale" && e.valeNumero ? Number(e.valeNumero) : undefined,
      data_pagamento_vale: e.forma === "vale" ? e.dataPagamentoVale : undefined,
    }))
    const dados: DadosPagamento = {
      forma: entradas[0].forma as FormaPagamento, // forma principal = primeira
      pagamentos,
      valorPago: String(totalMix.toFixed(2)),
    }
    onPagamentoChange(dados)
    onProximo()
  }

  const gasPovoTotal = (parseFloat(gasPovoValorGov) || 0) + (parseFloat(gasPovoFrete) || 0)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={s.pagina}>

      {/* Toggle modo */}
      <div style={s.modoRow}>
        <button
          style={{ ...s.modoBtn, ...(modo === "unica" ? s.modoBtnAtivo : {}) }}
          onClick={() => setModo("unica")}
        >
          1 forma
        </button>
        <button
          style={{ ...s.modoBtn, ...(modo === "mix" ? s.modoBtnAtivo : {}) }}
          onClick={() => { setModo("mix"); setFormaUnica(null) }}
        >
          Mix de formas
        </button>
      </div>

      {/* ── MODO ÚNICO ── */}
      {modo === "unica" && (
        <>
          <p style={s.instrucao}>Selecione a forma de pagamento</p>
          <div style={s.grade}>
            {/* Formas mix */}
            {FORMAS_MIX.map(f => (
              <div
                key={f.id}
                style={{ ...s.fpCard, ...(formaUnica === f.id ? s.fpSel : {}) }}
                onClick={() => selecionarFormaUnica(f.id)}
              >
                <span style={s.fpIcone}>{f.icone}</span>
                <span style={s.fpLabel}>{f.label}</span>
              </div>
            ))}
            {/* Gás do Povo — exclusivo */}
            <div
              style={{ ...s.fpCard, ...(formaUnica === "gas_povo" ? s.fpSel : {}), gridColumn: "1 / -1" }}
              onClick={() => selecionarFormaUnica("gas_povo")}
            >
              <span style={s.fpIcone}>🚛</span>
              <span style={s.fpLabel}>Gás do Povo</span>
            </div>
          </div>

          {/* Fiado único */}
          {formaUnica === "vale" && (
            <div style={s.extra}>
              <label style={s.label}>Número da folha (bloco)</label>
              <input
                style={s.input} type="number" inputMode="numeric"
                value={valeNumUnico} onChange={e => setValeNumUnico(e.target.value)}
                placeholder="Ex: 1104"
              />
              <label style={s.label}>Vencimento</label>
              <input
                style={s.input} type="date"
                value={vencUnico} onChange={e => setVencUnico(e.target.value)}
              />
              <div style={s.totalBox}>
                Total em fiado: <strong>R$ {totalSacola.toFixed(2).replace(".", ",")}</strong>
              </div>
            </div>
          )}

          {/* Gás do Povo */}
          {formaUnica === "gas_povo" && (
            <div style={s.extra}>
              <div style={s.aviso}>
                Programa governamental — o governo paga depois. O frete é cobrado do cliente no ato.
              </div>
              <div style={s.rowDois}>
                <div style={{ flex: 1 }}>
                  <label style={s.label}>Valor do governo (R$)</label>
                  <input
                    style={s.input} type="number" inputMode="decimal" step="0.01"
                    value={gasPovoValorGov} onChange={e => setGasPovoValorGov(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={s.label}>Frete do cliente (R$)</label>
                  <input
                    style={s.input} type="number" inputMode="decimal" step="0.01"
                    value={gasPovoFrete} onChange={e => setGasPovoFrete(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
              </div>
              {gasPovoTotal > 0 && (
                <div style={s.totalBox}>
                  Total a receber: <strong>R$ {gasPovoTotal.toFixed(2).replace(".", ",")}</strong>
                </div>
              )}
            </div>
          )}

          {/* Demais formas únicas */}
          {formaUnica && !["vale", "gas_povo"].includes(formaUnica) && (
            <div style={s.extra}>
              <label style={s.label}>Valor pago (R$)</label>
              <input
                style={s.input} type="number" inputMode="decimal" step="0.01"
                value={valorUnico} onChange={e => setValorUnico(e.target.value)}
              />
            </div>
          )}

          <div style={s.rodape}>
            <button style={s.btnVoltar} onClick={onVoltar}>← Voltar</button>
            <button
              style={{ ...s.btnProximo, opacity: podeProximoUnica() ? 1 : 0.4 }}
              disabled={!podeProximoUnica()}
              onClick={confirmarUnica}
            >Revisar →</button>
          </div>
        </>
      )}

      {/* ── MODO MIX ── */}
      {modo === "mix" && (
        <>
          <p style={s.instrucao}>Selecione as formas e informe o valor de cada uma</p>

          {/* Chips de seleção */}
          <div style={s.grade}>
            {FORMAS_MIX.map(f => {
              const ativa = entradas.some(e => e.forma === f.id)
              return (
                <div
                  key={f.id}
                  style={{ ...s.fpCard, ...(ativa ? s.fpSel : {}) }}
                  onClick={() => toggleFormaMix(f.id)}
                >
                  <span style={s.fpIcone}>{f.icone}</span>
                  <span style={s.fpLabel}>{f.label}</span>
                  {ativa && <span style={s.check}>✓</span>}
                </div>
              )
            })}
          </div>

          {/* Entradas de valor por forma */}
          {entradas.length > 0 && (
            <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
              {entradas.map(e => {
                const meta = FORMAS_MIX.find(f => f.id === e.forma)!
                return (
                  <div key={e.forma} style={s.mixCard}>
                    <div style={s.mixCardTopo}>
                      <span style={s.mixCardLabel}>{meta.icone} {meta.label}</span>
                      <button style={s.btnRemoverForma} onClick={() => toggleFormaMix(e.forma)}>✕</button>
                    </div>
                    <label style={s.label}>Valor (R$)</label>
                    <input
                      style={s.input} type="number" inputMode="decimal" step="0.01"
                      value={e.valor}
                      onChange={ev => atualizarEntrada(e.forma, { valor: ev.target.value })}
                      placeholder="0,00"
                    />
                    {e.forma === "vale" && (
                      <>
                        <label style={{ ...s.label, marginTop: "6px" }}>Número da folha (bloco)</label>
                        <input
                          style={s.input} type="number" inputMode="numeric"
                          value={e.valeNumero ?? ""}
                          onChange={ev => atualizarEntrada(e.forma, { valeNumero: ev.target.value })}
                          placeholder="Ex: 1104"
                        />
                        <label style={{ ...s.label, marginTop: "6px" }}>Vencimento</label>
                        <input
                          style={s.input} type="date"
                          value={e.dataPagamentoVale ?? proximoVencimentoPadrao()}
                          onChange={ev => atualizarEntrada(e.forma, { dataPagamentoVale: ev.target.value })}
                        />
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Resumo do mix */}
          {entradas.length >= 2 && (
            <div style={{ ...s.totalBox, marginTop: "12px", flexDirection: "column" as const, display: "flex", gap: "4px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Total da sacola</span>
                <strong>R$ {totalSacola.toFixed(2).replace(".", ",")}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Informado</span>
                <strong>R$ {totalMix.toFixed(2).replace(".", ",")}</strong>
              </div>
              {faltaMix > 0.01 && (
                <div style={{ display: "flex", justifyContent: "space-between", color: VERMELHO }}>
                  <span>Falta cobrir</span>
                  <strong>R$ {faltaMix.toFixed(2).replace(".", ",")}</strong>
                </div>
              )}
              {mixTemFiadoSemFolha && (
                <p style={{ fontSize: "12px", color: VERMELHO, margin: "4px 0 0" }}>
                  ⚠️ Informe o número da folha do fiado.
                </p>
              )}
            </div>
          )}

          <div style={s.rodape}>
            <button style={s.btnVoltar} onClick={onVoltar}>← Voltar</button>
            <button
              style={{ ...s.btnProximo, opacity: mixValido ? 1 : 0.4 }}
              disabled={!mixValido}
              onClick={confirmarMix}
            >Revisar →</button>
          </div>
        </>
      )}
    </div>
  )
}

const s: Record<string, CSSProperties> = {
  pagina:    { padding: "0.75rem 1rem 1.5rem" },
  instrucao: { fontSize: "0.85rem", color: "#111111", fontWeight: 500, margin: "0 0 0.75rem" },

  modoRow: {
    display: "flex", gap: "0", marginBottom: "14px",
    border: "1.5px solid #D1D5DB", borderRadius: "10px", overflow: "hidden",
  },
  modoBtn: {
    flex: 1, padding: "9px 0", border: "none", background: "#F9FAFB",
    fontSize: "13px", fontWeight: 600, color: "#6B7280", cursor: "pointer",
  },
  modoBtnAtivo: { background: VERDE, color: "#fff" },

  grade: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" },
  fpCard: {
    background: C.fundoCard, border: "1.5px solid #9CA3AF",
    borderRadius: "12px", padding: "14px 8px",
    display: "flex", flexDirection: "column" as const, alignItems: "center",
    gap: "6px", cursor: "pointer", userSelect: "none", position: "relative",
  },
  fpSel:   { border: `2px solid ${VERDE}`, background: "#f0f4eb" },
  fpIcone: { fontSize: "22px" },
  fpLabel: { fontSize: "13px", fontWeight: 600, color: "#111111", textAlign: "center" as const },
  check: {
    position: "absolute", top: "6px", right: "8px",
    fontSize: "11px", fontWeight: 700, color: VERDE,
  },

  extra:  { marginTop: "12px", display: "flex", flexDirection: "column", gap: "6px" },
  label:  { fontSize: "13px", fontWeight: 600, color: "#111111" },
  input: {
    width: "100%", boxSizing: "border-box" as const, padding: "12px 14px",
    border: "1.5px solid #374151", borderRadius: "10px",
    fontSize: "16px", fontWeight: 500, color: "#111111",
    background: "#fff", outline: "none",
  },
  rowDois:  { display: "flex", gap: "8px" },
  aviso:    { fontSize: "12px", color: "#3a5c1a", background: "#f0f4eb", borderRadius: "8px", padding: "8px 10px" },
  totalBox: {
    background: C.fundoCard, border: `1px solid ${C.borda}`,
    borderRadius: "10px", padding: "10px 12px",
    fontSize: "14px", color: C.texto, marginTop: "8px",
  },

  mixCard: {
    background: "#F9FAFB", border: "1.5px solid #D1D5DB",
    borderRadius: "12px", padding: "12px 14px",
    display: "flex", flexDirection: "column", gap: "4px",
  },
  mixCardTopo: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" },
  mixCardLabel: { fontSize: "14px", fontWeight: 700, color: "#111111" },
  btnRemoverForma: {
    background: "none", border: "none", fontSize: "14px",
    color: "#9CA3AF", cursor: "pointer", padding: "0 4px",
  },

  rodape:    { display: "flex", gap: "10px", marginTop: "20px" },
  btnVoltar: {
    flex: 1, background: "transparent", border: "1.5px solid #374151",
    borderRadius: "12px", padding: "13px", fontSize: "15px",
    color: "#111111", fontWeight: 600, cursor: "pointer",
  },
  btnProximo: {
    flex: 2, background: VERDE, color: "#F8FAFC", border: "none",
    borderRadius: "12px", padding: "13px", fontSize: "15px", fontWeight: 600, cursor: "pointer",
  },
}
