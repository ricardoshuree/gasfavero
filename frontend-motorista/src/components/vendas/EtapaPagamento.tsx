// [mcp-local harness] feature: fix-token-unused | plano: 8c27409a | 2026-09-08 09:57:23
// Remove token da desestruturação — não usado após remoção do Vale Gás. Corrige TS6133.
// Etapa 3 — Forma de pagamento
// Vale Gás removido do app mobile (gerenciado apenas pelo gerente no web)
// Label e input do Fiado com contraste escuro para visibilidade dos motoristas
import { useEffect, useRef, useState, type CSSProperties } from "react"
import { CORES_APP as C } from "../../theme"
import { type DadosPagamento, type FormaPagamento } from "../../lib/vendas"

// Vale Gás removido — não disponível no app mobile
const FORMAS: { id: FormaPagamento; label: string; icone: string }[] = [
  { id: "pix",             label: "Pix",         icone: "📲" },
  { id: "dinheiro",       label: "Dinheiro",    icone: "💵" },
  { id: "cartao_debito",  label: "Débito",      icone: "💳" },
  { id: "cartao_credito", label: "Crédito",     icone: "💳" },
  { id: "vale",           label: "Fiado",       icone: "🧾" },
  { id: "gas_povo",       label: "Gás do Povo", icone: "🚛" },
]

interface Props {
  token?: string  // mantido na interface para compatibilidade, não usado internamente
  pagamento: DadosPagamento | null
  totalSacola: number
  onPagamentoChange: (p: DadosPagamento) => void
  onVoltar: () => void
  onProximo: () => void
}

export default function EtapaPagamento({
  pagamento, totalSacola, onPagamentoChange, onVoltar, onProximo
}: Props) {
  const forma = pagamento?.forma ?? null

  const [valeNum, setValeNum] = useState(pagamento?.valeNumero ?? "")
  const [gasPovoValorGov, setGasPovoValorGov] = useState(pagamento?.gasPovoValorGov ?? "")
  const [gasPovoFrete, setGasPovoFrete] = useState(pagamento?.gasPovoFrete ?? "")
  const [valorPago, setValorPago] = useState(pagamento?.valorPago ?? String(totalSacola.toFixed(2)))

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  function selecionarForma(f: FormaPagamento) {
    const base: DadosPagamento = { forma: f, valorPago: String(totalSacola.toFixed(2)) }
    onPagamentoChange(base)
    setValorPago(String(totalSacola.toFixed(2)))
    setValeNum("")
    setGasPovoValorGov(""); setGasPovoFrete("")
  }

  function podeProximo(): boolean {
    if (!forma) return false
    if (forma === "vale") return valeNum.trim().length > 0
    if (forma === "gas_povo") return parseFloat(gasPovoValorGov) > 0 && parseFloat(gasPovoFrete) > 0
    return true
  }

  function confirmar() {
    if (!forma) return
    const dados: DadosPagamento = {
      forma,
      valorPago: forma === "gas_povo" ? gasPovoValorGov : valorPago,
      valeNumero: forma === "vale" ? valeNum : undefined,
      gasPovoValorGov: forma === "gas_povo" ? gasPovoValorGov : undefined,
      gasPovoFrete: forma === "gas_povo" ? gasPovoFrete : undefined,
    }
    onPagamentoChange(dados)
    onProximo()
  }

  const gasPovoTotal = (parseFloat(gasPovoValorGov) || 0) + (parseFloat(gasPovoFrete) || 0)

  return (
    <div style={s.pagina}>
      <p style={s.instrucao}>Selecione a forma de pagamento</p>

      <div style={s.grade}>
        {FORMAS.map(f => (
          <div
            key={f.id}
            style={{ ...s.fpCard, ...(forma === f.id ? s.fpSel : {}) }}
            onClick={() => selecionarForma(f.id)}
          >
            <span style={s.fpIcone}>{f.icone}</span>
            <span style={s.fpLabel}>{f.label}</span>
          </div>
        ))}
      </div>

      {/* Fiado */}
      {forma === "vale" && (
        <div style={s.extra}>
          <label style={s.labelEscuro}>Número do fiado</label>
          <input
            style={s.inputEscuro}
            type="number" inputMode="numeric"
            value={valeNum}
            onChange={e => {
              setValeNum(e.target.value)
              onPagamentoChange({ forma: "vale", valorPago: String(totalSacola.toFixed(2)), valeNumero: e.target.value })
            }}
            placeholder="Ex: 123"
          />
        </div>
      )}

      {/* Gás do Povo */}
      {forma === "gas_povo" && (
        <div style={s.extra}>
          <div style={s.aviso}>
            Programa governamental — o governo paga depois. O frete é cobrado do cliente no ato.
          </div>
          <div style={s.rowDois}>
            <div style={{ flex: 1 }}>
              <label style={s.labelEscuro}>Valor do governo (R$)</label>
              <input
                style={s.inputEscuro} type="number" inputMode="decimal" step="0.01"
                value={gasPovoValorGov} onChange={e => setGasPovoValorGov(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={s.labelEscuro}>Frete do cliente (R$)</label>
              <input
                style={s.inputEscuro} type="number" inputMode="decimal" step="0.01"
                value={gasPovoFrete} onChange={e => setGasPovoFrete(e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>
          {gasPovoTotal > 0 && (
            <div style={s.total}>
              Total a receber: <strong>R$ {gasPovoTotal.toFixed(2).replace(".", ",")}</strong>
            </div>
          )}
        </div>
      )}

      {/* Formas simples */}
      {forma && !["vale", "gas_povo"].includes(forma) && (
        <div style={s.extra}>
          <label style={s.labelEscuro}>Valor pago (R$)</label>
          <input
            style={s.inputEscuro} type="number" inputMode="decimal" step="0.01"
            value={valorPago} onChange={e => setValorPago(e.target.value)}
          />
        </div>
      )}

      <div style={s.rodape}>
        <button style={s.btnVoltar} onClick={onVoltar}>← Voltar</button>
        <button
          style={{ ...s.btnProximo, opacity: podeProximo() ? 1 : 0.4 }}
          disabled={!podeProximo()} onClick={confirmar}
        >
          Revisar →
        </button>
      </div>
    </div>
  )
}

const s: Record<string, CSSProperties> = {
  pagina:      { padding: "0.75rem 1rem 1.5rem" },
  instrucao:   { fontSize: "0.85rem", color: "#111111", fontWeight: 500, margin: "0 0 0.75rem" },
  grade:       { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" },
  fpCard: {
    background: C.fundoCard, border: "1.5px solid #9CA3AF",
    borderRadius: "12px", padding: "14px 8px",
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: "6px", cursor: "pointer", userSelect: "none",
  },
  fpSel:       { border: "2px solid #606C38", background: "#f0f4eb" },
  fpIcone:     { fontSize: "22px" },
  fpLabel:     { fontSize: "13px", fontWeight: 600, color: "#111111", textAlign: "center" as const },
  extra:       { marginTop: "12px", display: "flex", flexDirection: "column", gap: "6px" },
  labelEscuro: { fontSize: "14px", fontWeight: 600, color: "#111111" },
  inputEscuro: {
    width: "100%", boxSizing: "border-box" as const, padding: "12px 14px",
    border: "1.5px solid #374151", borderRadius: "10px",
    fontSize: "16px", fontWeight: 500, color: "#111111",
    background: "#fff", outline: "none",
  },
  rowDois:     { display: "flex", gap: "8px" },
  aviso:       { fontSize: "12px", color: "#3a5c1a", background: "#f0f4eb", borderRadius: "8px", padding: "8px 10px" },
  total:       { fontSize: "14px", color: C.texto, background: C.fundoCard, borderRadius: "8px", padding: "10px 12px", textAlign: "right" as const },
  rodape:      { display: "flex", gap: "10px", marginTop: "20px" },
  btnVoltar: {
    flex: 1, background: "transparent", border: "1.5px solid #374151",
    borderRadius: "12px", padding: "13px", fontSize: "15px",
    color: "#111111", fontWeight: 600, cursor: "pointer",
  },
  btnProximo: {
    flex: 2, background: "#606C38", color: "#F8FAFC", border: "none",
    borderRadius: "12px", padding: "13px", fontSize: "15px", fontWeight: 600, cursor: "pointer",
  },
}
