// [mcp-local harness] feature: malote-motorista-fix | plano: c756f0d7 | 2026-09-07 13:45:20
// Remove fmtData nao utilizada
// Tela Malote do Motorista
// Visão consolidada do dia para apresentar ao gerente no fechamento presencial.
// Somente leitura — a conferência de diferenças e o fechamento são feitos pelo gerente no web.
import { useEffect, useState, type CSSProperties } from "react"
import { CORES_APP as C } from "../theme"
import type { UserMe } from "../lib/auth"
import { buscarResumoMalote, gerarTextoMalote, type ResumoMalote } from "../lib/malote"

function fmt(v: number) {
  return `R$ ${v.toFixed(2).replace(".", ",")}`
}

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

interface Props {
  token: string
  usuario: UserMe
}

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

function LinhaTotalSecao({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={s.linhaTotal}>
      <span>{label}</span>
      <span>{valor}</span>
    </div>
  )
}

export default function MaloteTela({ token, usuario }: Props) {
  const [resumo, setResumo] = useState<ResumoMalote | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState("")
  const [mostrarFiados, setMostrarFiados] = useState(false)

  const hoje = new Date().toLocaleDateString("pt-BR")
  const nomeMotorista = usuario.full_name ?? usuario.email

  useEffect(() => {
    buscarResumoMalote(token, usuario.id)
      .then(setResumo)
      .catch(e => setErro(e.message ?? "Não foi possível carregar o malote."))
      .finally(() => setCarregando(false))
  }, [token, usuario.id])

  function compartilhar() {
    if (!resumo) return
    const texto = gerarTextoMalote(resumo, nomeMotorista)
    const url = `https://wa.me/?text=${encodeURIComponent(texto)}`
    window.open(url, "_blank")
  }

  if (carregando) return <p style={s.info}>Carregando malote...</p>
  if (erro) return (
    <div style={s.erroBox}>
      <p style={s.erroTitulo}>Não foi possível carregar o malote.</p>
      <p style={s.erroSub}>{erro}</p>
      <p style={s.erroSub}>Verifique se a abertura do dia foi registrada pelo gerente.</p>
    </div>
  )
  if (!resumo) return null

  const totalEntrega = resumo.total_geral
  const pendFiados = resumo.fiados_em_aberto.length
  const pendValeGas = resumo.vale_gas_aberto.length
  const pendGasPovo = resumo.gas_povo_aberto.length
  const totalPend = resumo.fiados_em_aberto.reduce((a, f) => a + Number(f.valor_total), 0)
    + resumo.vale_gas_aberto.reduce((a, f) => a + Number(f.valor_total), 0)
    + resumo.gas_povo_aberto.reduce((a, f) => a + Number(f.valor_total), 0)

  return (
    <div style={s.pagina}>
      <div style={s.totalBox}>
        <div>
          <div style={s.totalLabel}>Total a entregar ao gerente</div>
          <div style={s.totalValor}>{fmt(totalEntrega)}</div>
        </div>
        <div style={{ textAlign: "right" as const }}>
          <div style={s.totalSub}>{resumo.qtd_vendas} vendas</div>
          <div style={s.totalSub}>{hoje}</div>
        </div>
      </div>

      <div style={s.corpo}>

        {/* Produtos — tabela */}
        <Secao titulo="🛢 Cilindros — conferir no caminhão">
          {resumo.carga_produtos.length === 0 ? (
            <div style={s.semDados}>Sem carga registrada na abertura do dia.</div>
          ) : (
            <table style={s.tabela}>
              <thead>
                <tr>
                  <th style={s.th}>Produto</th>
                  <th style={{ ...s.th, textAlign: "center" as const }}>Saiu</th>
                  <th style={{ ...s.th, textAlign: "center" as const }}>Retornou</th>
                  <th style={{ ...s.th, textAlign: "center" as const, color: "#3a5c1a" }}>Vendido</th>
                </tr>
              </thead>
              <tbody>
                {resumo.carga_produtos.map((p, i) => (
                  <tr key={p.produto_id} style={{ background: i % 2 === 0 ? "#fafafa" : "#fff" }}>
                    <td style={s.td}>{p.produto_nome}</td>
                    <td style={{ ...s.td, textAlign: "center" as const }}>{p.carregado}</td>
                    <td style={{ ...s.td, textAlign: "center" as const, color: C.textoSecundario }}>—</td>
                    <td style={{ ...s.td, textAlign: "center" as const, color: "#3a5c1a", fontWeight: 700 }}>
                      {p.carregado}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={s.avisoTabela}>
            O retorno de cilindros é registrado pelo gerente no fechamento.
          </div>
        </Secao>

        {/* Dinheiro a entregar */}
        <Secao titulo="💵 Dinheiro a entregar">
          <Linha label="Espécie (dinheiro)" valor={fmt(resumo.total_dinheiro)} cor="#3a5c1a" />
          <Linha label="Pix" valor={fmt(resumo.total_pix)} cor="#3a5c1a" />
          <Linha label="Débito (maquininha)" valor={fmt(resumo.total_debito)} cor="#b45309" sub="apresentar recibos" />
          <Linha label="Crédito (maquininha)" valor={fmt(resumo.total_credito)} cor="#b45309" sub="apresentar recibos" />
          <Linha
            label="Fiados recebidos hoje"
            valor={fmt(resumo.total_fiado_recebido)}
            cor="#3a5c1a"
            sub={resumo.fiados_recebidos.length > 0 ? `${resumo.fiados_recebidos.length} cliente(s) — toque para ver` : undefined}
          />
          <LinhaTotalSecao label="Subtotal" valor={fmt(totalEntrega)} />
        </Secao>

        {/* Detalhe dos fiados recebidos hoje */}
        {resumo.fiados_recebidos.length > 0 && (
          <div style={s.secao}>
            <button style={s.btnExpandir} onClick={() => setMostrarFiados(p => !p)}>
              {mostrarFiados ? "▲" : "▼"} Fiados recebidos hoje ({resumo.fiados_recebidos.length})
            </button>
            {mostrarFiados && (
              <div style={s.secaoCard}>
                {resumo.fiados_recebidos.map(f => (
                  <div key={f.id} style={s.linha}>
                    <div>
                      <div style={s.linhaLabel}>{f.cliente_nome}</div>
                      <div style={s.linhaSub}>
                        Vale nº {f.vale_numero ?? "—"} · {f.itens.map(i => `${i.quantidade}× ${i.produto_title}`).join(", ")} · {fmtHora(f.recebido_em)}
                      </div>
                    </div>
                    <span style={{ ...s.linhaValor, color: "#3a5c1a" }}>{fmt(Number(f.valor_pago))}</span>
                  </div>
                ))}
                <LinhaTotalSecao label="Total" valor={fmt(resumo.total_fiado_recebido)} />
                <div style={s.avisoTabela}>Aguardando baixa do gerente no sistema web.</div>
              </div>
            )}
          </div>
        )}

        {/* Pendências */}
        {(pendFiados > 0 || pendValeGas > 0 || pendGasPovo > 0) && (
          <Secao titulo="⏳ Pendências — não entrega hoje">
            {pendFiados > 0 && (
              <Linha
                label="Fiados em aberto"
                valor={fmt(resumo.fiados_em_aberto.reduce((a, f) => a + Number(f.valor_total), 0))}
                cor="#92400e"
                sub={`${pendFiados} cliente(s)`}
              />
            )}
            {pendValeGas > 0 && (
              <Linha
                label="Vale Gás em aberto"
                valor={fmt(resumo.vale_gas_aberto.reduce((a, f) => a + Number(f.valor_total), 0))}
                cor="#92400e"
                sub={`${pendValeGas} venda(s)`}
              />
            )}
            {pendGasPovo > 0 && (
              <Linha
                label="Gás do Povo (gov. paga)"
                valor={fmt(resumo.gas_povo_aberto.reduce((a, f) => a + Number(f.valor_total), 0))}
                cor="#92400e"
                sub={`${pendGasPovo} venda(s)`}
              />
            )}
            <LinhaTotalSecao label="Total pendente" valor={fmt(totalPend)} />
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
  pagina: { background: C.fundo, minHeight: "100%", paddingBottom: "80px" },
  totalBox: { background: "#283618", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { color: "#C5C9A4", fontSize: "12px", marginBottom: "4px" },
  totalValor: { color: "#F8FAFC", fontSize: "22px", fontWeight: 700 },
  totalSub: { color: "#C5C9A4", fontSize: "11px" },
  corpo: { padding: "10px 14px 16px" },
  secao: { marginBottom: "14px" },
  secaoTitulo: { fontSize: "10px", fontWeight: 700, color: C.textoSecundario, textTransform: "uppercase" as const, letterSpacing: "0.6px", marginBottom: "6px" },
  secaoCard: { background: "#f5f5f5", borderRadius: "10px", overflow: "hidden" },
  linha: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "9px 12px", borderBottom: `0.5px solid #e5e7eb` },
  linhaLabel: { fontSize: "13px", color: "#374151" },
  linhaSub: { fontSize: "11px", color: C.textoSecundario, marginTop: "1px" },
  linhaValor: { fontSize: "13px", fontWeight: 700, flexShrink: 0, marginLeft: "8px" },
  linhaTotal: { display: "flex", justifyContent: "space-between", padding: "9px 12px", fontSize: "14px", fontWeight: 700, color: C.texto, background: "#fff", borderTop: `0.5px solid #e5e7eb` },
  tabela: { width: "100%", borderCollapse: "collapse" as const, fontSize: "13px" },
  th: { padding: "8px 10px", fontSize: "11px", fontWeight: 700, color: C.textoSecundario, textTransform: "uppercase" as const, letterSpacing: "0.4px", borderBottom: `1px solid #e5e7eb`, textAlign: "left" as const },
  td: { padding: "9px 10px", color: C.texto, borderBottom: `0.5px solid #f0f0f0`, fontSize: "14px" },
  avisoTabela: { fontSize: "11px", color: C.textoSecundario, padding: "6px 12px", background: "#f5f5f5" },
  semDados: { padding: "12px", fontSize: "13px", color: C.textoSecundario, textAlign: "center" as const },
  info: { textAlign: "center" as const, color: C.textoSecundario, fontSize: "14px", padding: "2rem" },
  erroBox: { padding: "2rem 1.5rem", textAlign: "center" as const },
  erroTitulo: { fontSize: "15px", fontWeight: 600, color: C.texto, margin: "0 0 6px" },
  erroSub: { fontSize: "13px", color: C.textoSecundario, margin: "4px 0" },
  btnExpandir: { width: "100%", background: "transparent", border: `1px solid ${C.borda}`, borderRadius: "10px", padding: "9px 14px", fontSize: "13px", color: "#606C38", fontWeight: 600, cursor: "pointer", textAlign: "left" as const, marginBottom: "6px" },
  btnCompartilhar: { display: "block", width: "100%", background: "#606C38", color: "#F8FAFC", border: "none", borderRadius: "12px", padding: "14px", fontSize: "15px", fontWeight: 600, cursor: "pointer", textAlign: "center" as const, boxSizing: "border-box" as const, marginTop: "4px" },
}
