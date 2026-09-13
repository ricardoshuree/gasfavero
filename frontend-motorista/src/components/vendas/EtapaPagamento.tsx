// [mcp-local harness] feature: pagamento-fix-vale | plano: 513c379a | 2026-09-13 20:07:34
// Fix: temFiado declarado antes do useEffect como variável estável; remove referência inválida a temFiadoAtivo
// EtapaPagamento — modelo fiel ao ERP
//
// COMPORTAMENTO:
// - Clicar numa forma = ativa; clicar de novo = desativa (toggle)
// - Gás do Povo é exclusivo: ao selecionar, deseleciona todas as outras
// - Se qualquer outra forma for selecionada enquanto Gás do Povo está ativo, remove Gás do Povo
// - Formas ativas abrem seus campos abaixo (inline, igual ao ERP)
// - Fiado: busca próximo número da folha do bloco do motorista; campo de vencimento
// - Mix (≥2 formas): cada forma tem seu valor parcial; soma deve cobrir o total
// - Forma única: valor = total da sacola (pré-preenchido, editável)
// - Valor pago exibido: soma das formas (ou valor gov + frete no Gás do Povo)
// - Vale Gás: não disponível no app mobile
import { useEffect, useRef, useState, type CSSProperties } from "react"
import { CORES_APP as C } from "../../theme"
import { request } from "../../lib/api"
import { type DadosPagamento, type FormaPagamento } from "../../lib/vendas"

const VERDE = "#606C38"
const VERMELHO = "#EA1D2C"
const AMBER = "#F59E0B"

type FormaId = "pix" | "dinheiro" | "cartao_debito" | "cartao_credito" | "vale" | "gas_povo"

const FORMAS: { id: FormaId; label: string; icone: string }[] = [
  { id: "pix",            label: "Pix",         icone: "📲" },
  { id: "dinheiro",       label: "Dinheiro",    icone: "💵" },
  { id: "cartao_debito",  label: "Débito",      icone: "💳" },
  { id: "cartao_credito", label: "Crédito",     icone: "💳" },
  { id: "vale",           label: "Fiado",       icone: "🧾" },
  { id: "gas_povo",       label: "Gás do Povo", icone: "🚛" },
]

function quintoUtilMesSeguinte(): string {
  const hoje = new Date()
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1)
  let uteis = 0
  const d = new Date(primeiroDia)
  while (uteis < 5) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== 0 && d.getDay() !== 6) uteis++
  }
  return d.toISOString().slice(0, 10)
}

function trinta(): string {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}

type VctoTipo = "quinto" | "trinta" | "manual"

interface Props {
  token: string
  motoristaId: string
  pagamento: DadosPagamento | null
  totalSacola: number
  sacola?: Array<{ titulo: string; quantidade: number; precoUnitario: string; comCasco: boolean; precoCascoAtual: string | null }>
  onPagamentoChange: (p: DadosPagamento) => void
  onVoltar: () => void
  onProximo: () => void
}

export default function EtapaPagamento({
  token, motoristaId, pagamento, totalSacola, sacola = [], onPagamentoChange, onVoltar, onProximo,
}: Props) {
  const [formasAtivas, setFormasAtivas] = useState<FormaId[]>(() => {
    if (!pagamento) return []
    if (pagamento.pagamentos && pagamento.pagamentos.length > 0)
      return pagamento.pagamentos.map(p => p.forma_pagamento as FormaId)
    return pagamento.forma ? [pagamento.forma as FormaId] : []
  })

  const [valoresPorForma, setValoresPorForma] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    if (pagamento?.pagamentos) {
      pagamento.pagamentos.forEach(p => { init[p.forma_pagamento] = String(p.valor) })
    } else if (pagamento?.valorPago && pagamento.forma) {
      init[pagamento.forma] = pagamento.valorPago
    }
    return init
  })

  const [valeNumero, setValeNumero] = useState(pagamento?.valeNumero ?? "")
  const [vctoTipo, setVctoTipo] = useState<VctoTipo>("quinto")
  const [dataPagamentoVale, setDataPagamentoVale] = useState(
    pagamento?.dataPagamentoVale ?? quintoUtilMesSeguinte()
  )
  const [gasPovoValorGov, setGasPovoValorGov] = useState(pagamento?.gasPovoValorGov ?? "")
  const [gasPovoFrete, setGasPovoFrete] = useState(pagamento?.gasPovoFrete ?? "")
  const prevTotal = useRef<number | null>(null)

  // FIX: dependência estável para o useEffect do fiado
  const temFiado = formasAtivas.includes("vale")

  // Busca próximo vale ao ativar fiado
  useEffect(() => {
    if (!temFiado || !motoristaId) return
    if (valeNumero) return
    request<{ numero: number | null }>(
      `/api/v1/vendas/proximo-numero-vale/${motoristaId}`, { token }
    ).then(r => {
      if (r.numero != null) setValeNumero(String(r.numero))
    }).catch(() => {})
  }, [temFiado, motoristaId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (prevTotal.current === totalSacola) return
    prevTotal.current = totalSacola
    if (formasAtivas.length === 1 && formasAtivas[0] !== "gas_povo") {
      setValoresPorForma(prev => ({ ...prev, [formasAtivas[0]]: totalSacola.toFixed(2) }))
    }
  }, [totalSacola]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleForma(f: FormaId) {
    setFormasAtivas(prev => {
      if (prev.includes(f)) {
        const novas = prev.filter(x => x !== f)
        setValoresPorForma(vp => { const n = { ...vp }; delete n[f]; return n })
        if (f === "vale") setValeNumero("")
        if (f === "gas_povo") { setGasPovoValorGov(""); setGasPovoFrete("") }
        return novas
      } else {
        let novas: FormaId[]
        if (f === "gas_povo") {
          setValoresPorForma({})
          setValeNumero("")
          novas = ["gas_povo"]
        } else {
          novas = prev.filter(x => x !== "gas_povo")
          if (prev.includes("gas_povo")) { setGasPovoValorGov(""); setGasPovoFrete("") }
          novas = [...novas, f]
        }
        setValoresPorForma(vp => {
          const n = { ...vp }
          if (f !== "gas_povo") {
            const somaAtual = novas.filter(x => x !== f).reduce((acc, x) => acc + (parseFloat(n[x] ?? "0") || 0), 0)
            const saldo = Math.max(0, totalSacola - somaAtual)
            n[f] = novas.length === 1 ? totalSacola.toFixed(2) : saldo > 0 ? saldo.toFixed(2) : ""
          }
          return n
        })
        return novas
      }
    })
  }

  function handleValorForma(f: FormaId, v: string) {
    setValoresPorForma(prev => {
      const novo = { ...prev, [f]: v }
      if (formasAtivas.length === 2) {
        const outra = formasAtivas.find(x => x !== f)
        if (outra && !prev[outra]) {
          const saldo = Math.max(0, totalSacola - (parseFloat(v) || 0))
          novo[outra] = saldo > 0 ? saldo.toFixed(2) : ""
        }
      }
      return novo
    })
  }

  function handleVctoTipo(tipo: VctoTipo) {
    setVctoTipo(tipo)
    if (tipo === "quinto") setDataPagamentoVale(quintoUtilMesSeguinte())
    else if (tipo === "trinta") setDataPagamentoVale(trinta())
  }

  const somaFormas = formasAtivas
    .filter(f => f !== "gas_povo")
    .reduce((acc, f) => acc + (parseFloat(valoresPorForma[f] ?? "0") || 0), 0)

  const gasPovoTotal = (parseFloat(gasPovoValorGov) || 0) + (parseFloat(gasPovoFrete) || 0)
  const isGasPovo = formasAtivas.includes("gas_povo")
  const totalPago = isGasPovo ? gasPovoTotal : somaFormas
  const cobre = isGasPovo ? gasPovoTotal > 0 : somaFormas >= totalSacola - 0.01
  const fiadoOk = !temFiado || valeNumero.trim().length > 0
  const gasPovoOk = !isGasPovo || (parseFloat(gasPovoValorGov) > 0 && parseFloat(gasPovoFrete) > 0)
  const podeProximo = formasAtivas.length > 0 && cobre && fiadoOk && gasPovoOk
  const falta = Math.max(0, totalSacola - somaFormas)

  function confirmar() {
    if (!podeProximo) return
    const isMix = formasAtivas.filter(f => f !== "gas_povo").length > 1
    if (isGasPovo) {
      onPagamentoChange({ forma: "gas_povo" as FormaPagamento, valorPago: gasPovoValorGov, gasPovoValorGov, gasPovoFrete })
    } else if (isMix) {
      const pagamentos = formasAtivas.map(f => ({
        forma_pagamento: f,
        valor: parseFloat(valoresPorForma[f] ?? "0") || 0,
        vale_numero: f === "vale" && valeNumero ? Number(valeNumero) : undefined,
        data_pagamento_vale: f === "vale" ? dataPagamentoVale : undefined,
      }))
      onPagamentoChange({
        forma: formasAtivas[0] as FormaPagamento,
        pagamentos,
        valorPago: String(somaFormas.toFixed(2)),
        valeNumero: temFiado ? valeNumero : undefined,
        dataPagamentoVale: temFiado ? dataPagamentoVale : undefined,
      })
    } else {
      const f = formasAtivas[0]
      onPagamentoChange({
        forma: f as FormaPagamento,
        valorPago: valoresPorForma[f] ?? String(totalSacola.toFixed(2)),
        valeNumero: f === "vale" ? valeNumero : undefined,
        dataPagamentoVale: f === "vale" ? dataPagamentoVale : undefined,
      })
    }
    onProximo()
  }

  const corPago = cobre && formasAtivas.length > 0 ? VERDE : AMBER

  return (
    <div style={s.pagina}>
      <p style={s.instrucao}>Selecione a forma de pagamento</p>

      <div style={s.grade}>
        {FORMAS.map(f => {
          const ativa = formasAtivas.includes(f.id)
          return (
            <div
              key={f.id}
              style={{ ...s.fpCard, ...(ativa ? s.fpSel : {}), ...(f.id === "gas_povo" ? { gridColumn: "1 / -1" } : {}) }}
              onClick={() => toggleForma(f.id)}
            >
              <span style={s.fpIcone}>{f.icone}</span>
              <span style={s.fpLabel}>{f.label}</span>
              {ativa && <span style={s.check}>✓</span>}
            </div>
          )
        })}
      </div>

      {formasAtivas.length > 0 && (
        <div style={s.painelFormas}>
          {isGasPovo && (
            <div style={s.formaBloco}>
              <p style={s.formaBlocoTitulo}>🚛 Gás do Povo</p>
              <div style={s.aviso}>Programa governamental — o governo paga depois. O frete é cobrado do cliente no ato.</div>
              <div style={s.rowDois}>
                <div style={{ flex: 1 }}>
                  <label style={s.label}>Valor do governo (R$)</label>
                  <input style={s.input} type="number" inputMode="decimal" step="0.01" value={gasPovoValorGov} onChange={e => setGasPovoValorGov(e.target.value)} placeholder="0,00" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={s.label}>Frete do cliente (R$)</label>
                  <input style={s.input} type="number" inputMode="decimal" step="0.01" value={gasPovoFrete} onChange={e => setGasPovoFrete(e.target.value)} placeholder="0,00" />
                </div>
              </div>
            </div>
          )}

          {formasAtivas.filter(f => f !== "gas_povo").map(f => {
            const meta = FORMAS.find(x => x.id === f)!
            return (
              <div key={f} style={s.formaBloco}>
                <div style={s.formaLinha}>
                  <span style={s.formaBlocoTitulo}>{meta.icone} {meta.label}</span>
                  <input
                    style={s.inputValor} type="number" inputMode="decimal" step="0.01"
                    value={valoresPorForma[f] ?? ""}
                    onChange={e => handleValorForma(f, e.target.value)}
                    placeholder="R$ 0,00"
                  />
                </div>
                {f === "vale" && (
                  <div style={s.fiadoExtra}>
                    <label style={s.label}>Número da folha (bloco)</label>
                    <input style={s.input} type="number" inputMode="numeric" value={valeNumero} onChange={e => setValeNumero(e.target.value)} placeholder="Ex: 1104" />
                    <label style={{ ...s.label, marginTop: "8px" }}>Vencimento</label>
                    <div style={s.vctoOpcoes}>
                      {([
                        { id: "quinto", label: "5º dia útil do mês seguinte" },
                        { id: "trinta", label: "30 dias a partir de hoje" },
                        { id: "manual", label: "Data manual" },
                      ] as const).map(op => (
                        <label key={op.id} style={s.vctoLabel}>
                          <input type="radio" name="vcto" checked={vctoTipo === op.id} onChange={() => handleVctoTipo(op.id)} style={{ accentColor: VERDE }} />
                          <span style={{ fontSize: "12px", color: "#374151" }}>{op.label}</span>
                        </label>
                      ))}
                    </div>
                    <input style={{ ...s.input, marginTop: "4px" }} type="date" value={dataPagamentoVale} onChange={e => { setDataPagamentoVale(e.target.value); setVctoTipo("manual") }} />
                  </div>
                )}
              </div>
            )
          })}

          {sacola.length > 0 && (
            <div style={s.itensSacola}>
              <p style={s.itensTitulo}>Itens da sacola</p>
              {sacola.map((i, idx) => {
                const subtotalGas = Number(i.precoUnitario) * i.quantidade
                const subtotalCasco = i.comCasco && i.precoCascoAtual ? Number(i.precoCascoAtual) * i.quantidade : 0
                return (
                  <div key={idx}>
                    <div style={s.itemLinhaResumoPag}>
                      <span>{i.quantidade}× {i.titulo}</span>
                      <span>R$ {subtotalGas.toFixed(2).replace(".", ",")}</span>
                    </div>
                    {i.comCasco && subtotalCasco > 0 && (
                      <div style={{ ...s.itemLinhaResumoPag, fontSize: "11px", color: "#92400e", paddingLeft: "10px" }}>
                        <span>📦 Casco</span>
                        <span>+R$ {subtotalCasco.toFixed(2).replace(".", ",")}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <div style={s.resumoBox}>
            <div style={s.resumoLinha}>
              <span style={{ color: VERDE, fontSize: "13px" }}>Sacola</span>
              <span style={{ color: VERDE, fontWeight: 700, fontSize: "13px" }}>R$ {totalSacola.toFixed(2).replace(".", ",")}</span>
            </div>
            <div style={s.resumoLinha}>
              <span style={{ color: corPago, fontSize: "13px" }}>Pago</span>
              <span style={{ color: corPago, fontWeight: 700, fontSize: "13px" }}>R$ {totalPago.toFixed(2).replace(".", ",")}</span>
            </div>
            {!isGasPovo && falta > 0.01 && (
              <div style={s.resumoLinha}>
                <span style={{ color: VERMELHO, fontSize: "12px" }}>Falta cobrir</span>
                <span style={{ color: VERMELHO, fontWeight: 700, fontSize: "12px" }}>R$ {falta.toFixed(2).replace(".", ",")}</span>
              </div>
            )}
            {temFiado && !valeNumero.trim() && (
              <p style={{ fontSize: "12px", color: VERMELHO, margin: "4px 0 0" }}>⚠️ Informe o número da folha do fiado.</p>
            )}
            <div style={{ ...s.resumoLinha, borderTop: `1px solid ${C.borda}`, marginTop: "6px", paddingTop: "6px" }}>
              <span style={{ fontSize: "15px", fontWeight: 700 }}>Total</span>
              <span style={{ fontSize: "18px", fontWeight: 700, color: corPago }}>R$ {totalPago.toFixed(2).replace(".", ",")}</span>
            </div>
          </div>
        </div>
      )}

      <div style={s.rodape}>
        <button style={s.btnVoltar} onClick={onVoltar}>← Voltar</button>
        <button style={{ ...s.btnProximo, opacity: podeProximo ? 1 : 0.4 }} disabled={!podeProximo} onClick={confirmar}>Revisar →</button>
      </div>
    </div>
  )
}

const s: Record<string, CSSProperties> = {
  pagina:    { padding: "0.75rem 1rem 1.5rem" },
  instrucao: { fontSize: "0.85rem", color: "#111111", fontWeight: 500, margin: "0 0 0.75rem" },
  grade:     { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" },
  fpCard: {
    background: C.fundoCard, border: "1.5px solid #9CA3AF", borderRadius: "12px", padding: "14px 8px",
    display: "flex", flexDirection: "column" as const, alignItems: "center",
    gap: "6px", cursor: "pointer", userSelect: "none", position: "relative",
  },
  fpSel:    { border: `2.5px solid ${VERDE}`, background: "#f0f4eb" },
  fpIcone:  { fontSize: "22px" },
  fpLabel:  { fontSize: "13px", fontWeight: 600, color: "#111111", textAlign: "center" as const },
  check:    { position: "absolute", top: "6px", right: "8px", fontSize: "11px", fontWeight: 700, color: VERDE },
  painelFormas: {
    marginTop: "14px", display: "flex", flexDirection: "column", gap: "8px",
    border: `1.5px solid ${AMBER}`, borderRadius: "12px", padding: "12px",
  },
  formaBloco: {
    background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: "10px",
    padding: "10px 12px", display: "flex", flexDirection: "column", gap: "6px",
  },
  formaBlocoTitulo: { fontSize: "13px", fontWeight: 700, color: "#111111", margin: 0 },
  formaLinha:       { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" },
  inputValor: {
    width: "120px", flexShrink: 0, padding: "8px 10px", border: "1.5px solid #374151",
    borderRadius: "8px", fontSize: "15px", fontWeight: 600, color: "#111111",
    background: "#fff", outline: "none", textAlign: "right" as const,
  },
  fiadoExtra: { display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" },
  vctoOpcoes: { display: "flex", flexDirection: "column", gap: "4px", margin: "4px 0 0" },
  vctoLabel:  { display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" },
  aviso:      { fontSize: "12px", color: "#3a5c1a", background: "#f0f4eb", borderRadius: "8px", padding: "8px 10px" },
  rowDois:    { display: "flex", gap: "8px" },
  label:      { fontSize: "12px", fontWeight: 600, color: "#374151" },
  input: {
    width: "100%", boxSizing: "border-box" as const, padding: "10px 12px",
    border: "1.5px solid #374151", borderRadius: "8px",
    fontSize: "15px", fontWeight: 500, color: "#111111", background: "#fff", outline: "none",
  },
  resumoBox:   { background: C.fundoCard, border: `1px solid ${C.borda}`, borderRadius: "10px", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "4px" },
  resumoLinha: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  rodape:      { display: "flex", gap: "10px", marginTop: "16px" },
  btnVoltar: {
    flex: 1, background: "transparent", border: "1.5px solid #374151",
    borderRadius: "12px", padding: "13px", fontSize: "15px", color: "#111111", fontWeight: 600, cursor: "pointer",
  },
  btnProximo: {
    flex: 2, background: VERDE, color: "#F8FAFC", border: "none",
    borderRadius: "12px", padding: "13px", fontSize: "15px", fontWeight: 600, cursor: "pointer",
  },
}


