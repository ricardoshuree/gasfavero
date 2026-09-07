// [mcp-local harness] feature: vendas-motorista | plano: d865e550 | 2026-09-07 12:14:24
// Etapa 3: grade 2 colunas de 7 formas de pagamento, campos extras para Fiado/Vale Gás/Gás do Povo com validação
// Etapa 3 — Forma de pagamento
// Grade 2×3 de formas simples + campos extras condicionais
// (Fiado: número do vale; Vale Gás: número + validação; Gás do Povo: valor gov + frete)
import { useEffect, useRef, useState, type CSSProperties } from "react"
import { CORES_APP as C } from "../../theme"
import { validarValeGas, type DadosPagamento, type FormaPagamento } from "../../lib/vendas"

const FORMAS: { id: FormaPagamento; label: string; icone: string }[] = [
  { id: "pix",            label: "Pix",        icone: "📲" },
  { id: "dinheiro",      label: "Dinheiro",   icone: "💵" },
  { id: "cartao_debito", label: "Débito",     icone: "💳" },
  { id: "cartao_credito",label: "Crédito",    icone: "💳" },
  { id: "vale",          label: "Fiado",      icone: "🧾" },
  { id: "vale_gas",      label: "Vale Gás",   icone: "🔥" },
  { id: "gas_povo",      label: "Gás do Povo",icone: "🚛" },
]

interface Props {
  token: string
  pagamento: DadosPagamento | null
  totalSacola: number
  onPagamentoChange: (p: DadosPagamento) => void
  onVoltar: () => void
  onProximo: () => void
}

export default function EtapaPagamento({
  token, pagamento, totalSacola, onPagamentoChange, onVoltar, onProximo
}: Props) {
  const forma = pagamento?.forma ?? null

  // Fiado
  const [valeNum, setValeNum] = useState(pagamento?.valeNumero ?? "")
  // Vale Gás
  const [valeGasNum, setValeGasNum] = useState(pagamento?.valeGasNumero ?? "")
  const [valeGasBlocoId, setValeGasBlocoId] = useState(pagamento?.valeGasBlocoId ?? "")
  const [valeGasNome, setValeGasNome] = useState("")
  const [valeGasValido, setValeGasValido] = useState<boolean | null>(null)
  const [validando, setValidando] = useState(false)
  // Gás do Povo
  const [gasPovoValorGov, setGasPovoValorGov] = useState(pagamento?.gasPovoValorGov ?? "")
  const [gasPovoFrete, setGasPovoFrete] = useState(pagamento?.gasPovoFrete ?? "")
  // Valor pago genérico (para formas simples)
  const [valorPago, setValorPago] = useState(pagamento?.valorPago ?? String(totalSacola.toFixed(2)))

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Validação debounced do número de Vale Gás
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!valeGasNum.trim()) { setValeGasValido(null); setValeGasBlocoId(""); setValeGasNome(""); return }
    debounceRef.current = setTimeout(async () => {
      setValidando(true)
      try {
        const r = await validarValeGas(token, valeGasNum)
        setValeGasValido(r.valido)
        setValeGasBlocoId(r.valido ? (r.bloco_id ?? "") : "")
        setValeGasNome(r.valido ? (r.estabelecimento_nome ?? "") : "")
      } catch {
        setValeGasValido(false)
      } finally {
        setValidando(false)
      }
    }, 600)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [valeGasNum, token])

  function selecionarForma(f: FormaPagamento) {
    // Ao trocar forma, reseta campos extras e repassa estado
    const base: DadosPagamento = { forma: f, valorPago: String(totalSacola.toFixed(2)) }
    onPagamentoChange(base)
    setValorPago(String(totalSacola.toFixed(2)))
    setValeNum(""); setValeGasNum(""); setValeGasBlocoId(""); setValeGasNome("")
    setGasPovoValorGov(""); setGasPovoFrete(""); setValeGasValido(null)
  }

  function podeProximo(): boolean {
    if (!forma) return false
    if (forma === "vale") return valeNum.trim().length > 0
    if (forma === "vale_gas") return valeGasValido === true && !!valeGasBlocoId
    if (forma === "gas_povo") return parseFloat(gasPovoValorGov) > 0 && parseFloat(gasPovoFrete) > 0
    return true
  }

  function confirmar() {
    if (!forma) return
    const dados: DadosPagamento = {
      forma,
      valorPago: forma === "gas_povo" ? gasPovoValorGov : valorPago,
      valeNumero: forma === "vale" ? valeNum : undefined,
      valeGasNumero: forma === "vale_gas" ? valeGasNum : undefined,
      valeGasBlocoId: forma === "vale_gas" ? valeGasBlocoId : undefined,
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

      {/* Grade 2 colunas — 7 itens = 3 linhas + 1 item */}
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

      {/* Campos extras condicionais */}
      {forma === "vale" && (
        <div style={s.extra}>
          <label style={s.label}>Número do fiado</label>
          <input
            style={s.input} type="number" inputMode="numeric"
            value={valeNum} onChange={e => setValeNum(e.target.value)}
            placeholder="Ex: 123"
          />
        </div>
      )}

      {forma === "vale_gas" && (
        <div style={s.extra}>
          <label style={s.label}>Número do vale gás</label>
          <input
            style={s.input} type="number" inputMode="numeric"
            value={valeGasNum} onChange={e => setValeGasNum(e.target.value)}
            placeholder="Ex: 1001"
          />
          {validando && <p style={s.info}>Verificando...</p>}
          {!validando && valeGasValido === true && (
            <div style={s.ok}>✓ {valeGasNome}</div>
          )}
          {!validando && valeGasValido === false && (
            <div style={s.erro}>Número não encontrado em nenhum bloco cadastrado.</div>
          )}
        </div>
      )}

      {forma === "gas_povo" && (
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
            <div style={s.total}>
              Total a receber: <strong>R$ {gasPovoTotal.toFixed(2).replace(".", ",")}</strong>
            </div>
          )}
        </div>
      )}

      {/* Valor pago para formas simples */}
      {forma && !["vale", "vale_gas", "gas_povo"].includes(forma) && (
        <div style={s.extra}>
          <label style={s.label}>Valor pago (R$)</label>
          <input
            style={s.input} type="number" inputMode="decimal" step="0.01"
            value={valorPago} onChange={e => setValorPago(e.target.value)}
          />
        </div>
      )}

      <div style={s.rodape}>
        <button style={s.btnVoltar} onClick={onVoltar}>← Voltar</button>
        <button
          style={{ ...s.btnProximo, opacity: podeProximo() ? 1 : 0.4 }}
          disabled={!podeProximo()}
          onClick={confirmar}
        >
          Revisar →
        </button>
      </div>
    </div>
  )
}

const s: Record<string, CSSProperties> = {
  pagina: { padding: "0.75rem 1rem 1.5rem" },
  instrucao: { fontSize: "0.8rem", color: C.textoSecundario, margin: "0 0 0.75rem" },
  grade: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" },
  fpCard: {
    background: C.fundoCard, border: `1.5px solid ${C.borda}`,
    borderRadius: "12px", padding: "14px 8px",
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: "6px", cursor: "pointer", userSelect: "none",
  },
  fpSel: { border: "2px solid #606C38", background: "#f0f4eb" },
  fpIcone: { fontSize: "22px" },
  fpLabel: { fontSize: "13px", fontWeight: 600, color: C.texto, textAlign: "center" as const },
  extra: { marginTop: "12px", display: "flex", flexDirection: "column", gap: "6px" },
  label: { fontSize: "13px", color: C.textoSecundario },
  input: {
    width: "100%", boxSizing: "border-box" as const, padding: "10px 12px",
    border: `1px solid ${C.borda}`, borderRadius: "10px",
    fontSize: "15px", color: C.texto, background: C.fundoCardInterno, outline: "none",
  },
  rowDois: { display: "flex", gap: "8px" },
  info: { fontSize: "13px", color: C.textoSecundario },
  ok: { fontSize: "13px", color: "#3a5c1a", background: "#f0f4eb", borderRadius: "8px", padding: "8px 10px" },
  erro: { fontSize: "13px", color: C.erro, background: "#fff5f5", borderRadius: "8px", padding: "8px 10px" },
  aviso: {
    fontSize: "12px", color: "#3a5c1a", background: "#f0f4eb",
    borderRadius: "8px", padding: "8px 10px",
  },
  total: {
    fontSize: "14px", color: C.texto, background: C.fundoCard,
    borderRadius: "8px", padding: "10px 12px", textAlign: "right" as const,
  },
  rodape: { display: "flex", gap: "10px", marginTop: "20px" },
  btnVoltar: {
    flex: 1, background: "transparent", border: `1px solid ${C.borda}`,
    borderRadius: "12px", padding: "13px", fontSize: "15px", color: C.texto, cursor: "pointer",
  },
  btnProximo: {
    flex: 2, background: "#606C38", color: "#F8FAFC", border: "none",
    borderRadius: "12px", padding: "13px", fontSize: "15px", fontWeight: 600, cursor: "pointer",
  },
}
