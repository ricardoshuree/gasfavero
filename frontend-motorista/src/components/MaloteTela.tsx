// [mcp-local harness] feature: malote-retorno-cascos-busca | plano: 51e5d554 | 2026-09-08 12:43:21
// MaloteTela: tabela de cilindros com colunas Saiu / Vendidos / Retornou
// MaloteTela — tabela de cilindros com colunas Saiu / Vendidos / Retornou
import { useEffect, useState, type CSSProperties } from "react"
import { CORES_APP as C } from "../theme"
import type { UserMe } from "../lib/auth"
import { buscarResumoMalote, gerarTextoMalote, type ResumoMalote } from "../lib/malote"

function fmt(v: number) {
  return `R$ ${v.toFixed(2).replace(".", ",")}`
}

interface Props { token: string; usuario: UserMe }

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={s.secao}>
      <div style={s.secaoTitulo}>{titulo}</div>
      <div style={s.secaoCard}>{children}</div>
    </div>
  )
}

function Linha({ label, valor, cor, sub }: { label: string; valor: string; cor?: string; sub?: string }) {
  return (
    <div style={s.linha}>
      <div>
        <span style={s.linhaLabel}>{label}</span>
        {sub && <div style={s.linhaSub}>{sub}</div>}
      </div>
      <span style={{ ...s.linhaValor, color: cor ?? C.texto }}>{valor}</span>
    </div>
  )
}

function LinhaTotal({ label, valor }: { label: string; valor: string }) {
  return <div style={s.linhaTotal}><span>{label}</span><span>{valor}</span></div>
}

const LABEL_FORMA: Record<string, string> = {
  cartao_debito: "Débito", cartao_credito: "Crédito",
  pix: "Pix", dinheiro: "Dinheiro",
  vale: "Fiado", vale_gas: "Vale Gás", gas_povo: "Gás do Povo",
}

export default function MaloteTela({ token, usuario }: Props) {
  const [resumo, setResumo] = useState<ResumoMalote | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState("")
  const [mostrarVendas, setMostrarVendas] = useState(false)

  const hoje = new Date().toLocaleDateString("pt-BR")
  const nomeMotorista = usuario.full_name ?? usuario.email

  useEffect(() => {
    setCarregando(true); setErro("")
    buscarResumoMalote(token, usuario.id)
      .then(setResumo)
      .catch(e => setErro(e.message ?? "Não foi possível carregar o malote."))
      .finally(() => setCarregando(false))
  }, [token, usuario.id])

  function compartilhar() {
    if (!resumo) return
    window.open(`https://wa.me/?text=${encodeURIComponent(gerarTextoMalote(resumo, nomeMotorista))}`, "_blank")
  }

  if (carregando) return <div style={s.centralizado}><p style={s.info}>Carregando malote...</p></div>

  if (erro || !resumo) {
    return (
      <div style={s.erroBox}>
        <div style={s.erroIcone}>📋</div>
        <p style={s.erroTitulo}>Malote indisponível</p>
        <p style={s.erroSub}>{erro || "Não foi possível carregar os dados."}</p>
        <p style={s.erroSub}>Verifique se o gerente já registrou a <strong>abertura do dia</strong> no sistema web.</p>
      </div>
    )
  }

  const cascos = resumo.cascos_do_dia
  const temCascos = cascos.total_aberto_acumulado > 0 || cascos.total_emprestados_hoje > 0

  return (
    <div style={s.pagina}>
      <div style={s.totalBox}>
        <div>
          <div style={s.totalLabel}>Total a entregar ao gerente</div>
          <div style={s.totalValor}>{fmt(resumo.total_geral)}</div>
        </div>
        <div style={{ textAlign: "right" as const }}>
          <div style={s.totalSub}>{resumo.vendas.length} venda{resumo.vendas.length !== 1 ? "s" : ""}</div>
          <div style={s.totalSub}>{hoje}</div>
          {resumo.ja_fechado && <div style={s.badgeFechado}>✓ Fechado</div>}
        </div>
      </div>

      <div style={s.corpo}>

        {/* Tabela de cilindros — Saiu / Vendidos / Retornou */}
        <Secao titulo="🛢 Cilindros — conferir no caminhão">
          {resumo.carga_produtos.length === 0 ? (
            <div style={s.semDados}>Sem carga registrada na abertura do dia.</div>
          ) : (
            <table style={s.tabela}>
              <thead>
                <tr>
                  <th style={s.th}>Produto</th>
                  <th style={{ ...s.th, textAlign: "center" as const }}>Saiu</th>
                  <th style={{ ...s.th, textAlign: "center" as const, color: "#92400e" }}>Vendidos</th>
                  <th style={{ ...s.th, textAlign: "center" as const, color: "#3a5c1a" }}>Retornou</th>
                </tr>
              </thead>
              <tbody>
                {resumo.carga_produtos.map((p, i) => {
                  const retornou = Math.max(0, p.carregado - (p.vendidos ?? 0))
                  return (
                    <tr key={p.produto_id} style={{ background: i % 2 === 0 ? "#fafafa" : "#fff" }}>
                      <td style={s.td}>{p.produto_nome}</td>
                      <td style={{ ...s.td, textAlign: "center" as const, fontWeight: 700 }}>{p.carregado}</td>
                      <td style={{ ...s.td, textAlign: "center" as const, fontWeight: 700, color: "#92400e" }}>
                        {p.vendidos ?? 0}
                      </td>
                      <td style={{ ...s.td, textAlign: "center" as const, fontWeight: 700, color: "#3a5c1a" }}>
                        {retornou}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          <div style={s.avisoTabela}>Retornou = Saiu − Vendidos (excluindo canceladas)</div>
        </Secao>

        {/* Dinheiro */}
        <Secao titulo="💵 Dinheiro a entregar">
          <Linha label="Espécie"              valor={fmt(resumo.total_dinheiro)}  cor="#3a5c1a" />
          <Linha label="Pix"                  valor={fmt(resumo.total_pix)}        cor="#3a5c1a" />
          <Linha label="Débito (maquininha)"  valor={fmt(resumo.total_debito)}     cor="#b45309" sub="apresentar recibos" />
          <Linha label="Crédito (maquininha)" valor={fmt(resumo.total_credito)}    cor="#b45309" sub="apresentar recibos" />
          <Linha label="Fiado"                valor={fmt(resumo.total_fiado)}      cor="#92400e" sub="não entra em caixa hoje" />
          <LinhaTotal label="Total em caixa"  valor={fmt(resumo.total_dinheiro + resumo.total_pix + resumo.total_debito + resumo.total_credito)} />
        </Secao>

        {/* Vendas do dia — expansível */}
        {resumo.vendas.length > 0 && (
          <div style={s.secao}>
            <button style={s.btnExpandir} onClick={() => setMostrarVendas(p => !p)}>
              {mostrarVendas ? "▲" : "▼"} Vendas do dia ({resumo.vendas.length})
            </button>
            {mostrarVendas && (
              <div style={s.secaoCard}>
                {resumo.vendas.map(v => (
                  <div key={v.id} style={s.linha}>
                    <div>
                      <div style={s.linhaLabel}>{v.cliente_nome}</div>
                      <div style={s.linhaSub}>{LABEL_FORMA[v.forma_pagamento] ?? v.forma_pagamento}</div>
                    </div>
                    <span style={{ ...s.linhaValor, color: v.forma_pagamento === "vale" ? "#92400e" : "#3a5c1a" }}>
                      {fmt(v.valor_pago)}
                    </span>
                  </div>
                ))}
                <LinhaTotal label="Total" valor={fmt(resumo.total_geral)} />
              </div>
            )}
          </div>
        )}

        {/* Cascos */}
        {temCascos && (
          <Secao titulo="📦 Cascos">
            {cascos.total_emprestados_hoje > 0 && (
              <Linha label="Emprestados hoje" valor={`${cascos.total_emprestados_hoje} casco${cascos.total_emprestados_hoje !== 1 ? "s" : ""}`} cor="#92400e" />
            )}
            {cascos.total_devolvidos_hoje > 0 && (
              <Linha label="Devolvidos hoje" valor={`${cascos.total_devolvidos_hoje} casco${cascos.total_devolvidos_hoje !== 1 ? "s" : ""}`} cor="#3a5c1a" />
            )}
            {cascos.total_aberto_acumulado > 0 && (
              <Linha label="Em aberto acumulado" valor={`${cascos.total_aberto_acumulado} casco${cascos.total_aberto_acumulado !== 1 ? "s" : ""}`} cor="#dc2626" sub="aguardando devolução" />
            )}
          </Secao>
        )}

        <button style={s.btnCompartilhar} onClick={compartilhar}>
          📤 Compartilhar resumo (WhatsApp)
        </button>
      </div>
    </div>
  )
}

const s: Record<string, CSSProperties> = {
  pagina:        { background: C.fundo, minHeight: "100%", paddingBottom: "80px" },
  centralizado:  { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "40vh" },
  totalBox:      { background: "#283618", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  totalLabel:    { color: "#C5C9A4", fontSize: "12px", marginBottom: "4px" },
  totalValor:    { color: "#F8FAFC", fontSize: "22px", fontWeight: 700 },
  totalSub:      { color: "#C5C9A4", fontSize: "11px" },
  badgeFechado:  { fontSize: "11px", background: "#606C38", color: "#F8FAFC", padding: "2px 8px", borderRadius: "8px", marginTop: "4px", display: "inline-block" },
  corpo:         { padding: "10px 14px 16px" },
  secao:         { marginBottom: "14px" },
  secaoTitulo:   { fontSize: "10px", fontWeight: 700, color: C.textoSecundario, textTransform: "uppercase" as const, letterSpacing: "0.6px", marginBottom: "6px" },
  secaoCard:     { background: "#f5f5f5", borderRadius: "10px", overflow: "hidden" },
  linha:         { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "9px 12px", borderBottom: `0.5px solid #e5e7eb` },
  linhaLabel:    { fontSize: "13px", color: "#374151" },
  linhaSub:      { fontSize: "11px", color: C.textoSecundario, marginTop: "1px" },
  linhaValor:    { fontSize: "13px", fontWeight: 700, flexShrink: 0, marginLeft: "8px" },
  linhaTotal:    { display: "flex", justifyContent: "space-between", padding: "9px 12px", fontSize: "14px", fontWeight: 700, color: C.texto, background: "#fff", borderTop: `0.5px solid #e5e7eb` },
  tabela:        { width: "100%", borderCollapse: "collapse" as const, fontSize: "13px" },
  th:            { padding: "8px 10px", fontSize: "11px", fontWeight: 700, color: C.textoSecundario, textTransform: "uppercase" as const, letterSpacing: "0.4px", borderBottom: `1px solid #e5e7eb`, textAlign: "left" as const },
  td:            { padding: "9px 10px", color: C.texto, borderBottom: `0.5px solid #f0f0f0`, fontSize: "14px" },
  avisoTabela:   { fontSize: "11px", color: C.textoSecundario, padding: "6px 12px" },
  semDados:      { padding: "12px", fontSize: "13px", color: C.textoSecundario, textAlign: "center" as const },
  info:          { textAlign: "center" as const, color: C.textoSecundario, fontSize: "14px", padding: "2rem" },
  erroBox:       { padding: "3rem 2rem", textAlign: "center" as const },
  erroIcone:     { fontSize: "40px", marginBottom: "12px" },
  erroTitulo:    { fontSize: "16px", fontWeight: 700, color: C.texto, margin: "0 0 8px" },
  erroSub:       { fontSize: "13px", color: C.textoSecundario, margin: "4px 0", lineHeight: "1.5" },
  btnExpandir:   { width: "100%", background: "transparent", border: `1px solid ${C.borda}`, borderRadius: "10px", padding: "9px 14px", fontSize: "13px", color: "#606C38", fontWeight: 600, cursor: "pointer", textAlign: "left" as const, marginBottom: "6px" },
  btnCompartilhar: { display: "block", width: "100%", background: "#606C38", color: "#F8FAFC", border: "none", borderRadius: "12px", padding: "14px", fontSize: "15px", fontWeight: 600, cursor: "pointer", textAlign: "center" as const, boxSizing: "border-box" as const, marginTop: "4px" },
}
