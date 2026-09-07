// [mcp-local harness] feature: fix-steps-header-rbac-produtos | plano: be918930 | 2026-09-07 19:12:16
// Fix steps: linha conectora e bolinha alinhadas no mesmo eixo vertical via alignItems center em todos os níveis
// VendasTela: orquestrador do fluxo 4 etapas com indicador de progresso estilo iFood
import { useState, type CSSProperties } from "react"
import type { UserMe } from "../lib/auth"
import type { Cliente, DadosPagamento, ItemSacola } from "../lib/vendas"
import EtapaCliente from "./vendas/EtapaCliente"
import EtapaPagamento from "./vendas/EtapaPagamento"
import EtapaProdutos from "./vendas/EtapaProdutos"
import ResumoConfirmacao from "./vendas/ResumoConfirmacao"

type Etapa = "produtos" | "cliente" | "pagamento" | "resumo" | "sucesso"

const ETAPAS: Etapa[] = ["produtos", "cliente", "pagamento", "resumo"]
const ETAPA_LABEL: Record<Etapa, string> = {
  produtos:  "Produtos",
  cliente:   "Cliente",
  pagamento: "Pagamento",
  resumo:    "Resumo",
  sucesso:   "",
}

interface Props {
  token: string
  usuario: UserMe
}

export default function VendasTela({ token, usuario }: Props) {
  const [etapa, setEtapa] = useState<Etapa>("produtos")
  const [sacola, setSacola] = useState<ItemSacola[]>([])
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [enderecoId, setEnderecoId] = useState<string | null>(null)
  const [pagamento, setPagamento] = useState<DadosPagamento | null>(null)

  const totalSacola = sacola.reduce((acc, i) => acc + Number(i.precoUnitario) * i.quantidade, 0)

  function resetar() {
    setSacola([])
    setCliente(null)
    setEnderecoId(null)
    setPagamento(null)
    setEtapa("produtos")
  }

  if (etapa === "sucesso") {
    return (
      <div style={s.sucesso}>
        <div style={s.sucessoIcone}>✓</div>
        <p style={s.sucessoTitulo}>Venda registrada!</p>
        <p style={s.sucessoSub}>A venda foi salva com sucesso.</p>
        <button style={s.btnNova} onClick={resetar}>+ Nova venda</button>
      </div>
    )
  }

  const etapaIdx = ETAPAS.indexOf(etapa as Etapa)

  return (
    <div style={s.pagina}>

      {/* ── Barra de steps estilo iFood ── */}
      <div style={s.stepsBar}>
        {ETAPAS.map((e, idx) => {
          const ativo   = idx === etapaIdx
          const passado = idx < etapaIdx

          return (
            <div key={e} style={{ ...s.stepWrapper, ...(idx === 0 ? { paddingLeft: 0 } : {}) }}>
              {/* Linha conectora — antes de cada step (exceto o primeiro) */}
              {idx > 0 && (
                <div style={{
                  ...s.linha,
                  background: idx <= etapaIdx ? "#EA1D2C" : "#E5E7EB",
                }} />
              )}

              {/* Bolinha + label */}
              <div style={s.stepItem}>
                <div style={{
                  ...s.bolinha,
                  background: (ativo || passado) ? "#EA1D2C" : "#E5E7EB",
                }}>
                  {passado
                    ? <span style={s.check}>✓</span>
                    : <span style={{ ...s.num, color: ativo ? "#fff" : "#9CA3AF" }}>{idx + 1}</span>
                  }
                </div>
                <span style={{
                  ...s.stepLabel,
                  color:      ativo ? "#EA1D2C" : passado ? "#6B7280" : "#9CA3AF",
                  fontWeight: ativo ? 700 : 400,
                }}>
                  {ETAPA_LABEL[e]}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {etapa === "produtos" && (
        <EtapaProdutos
          token={token}
          sacola={sacola}
          onSacolaChange={setSacola}
          onProximo={() => setEtapa("cliente")}
        />
      )}
      {etapa === "cliente" && (
        <EtapaCliente
          token={token}
          clienteSelecionado={cliente}
          enderecoId={enderecoId}
          onClienteChange={c => { setCliente(c); if (c?.endereco?.id) setEnderecoId(c.endereco.id) }}
          onEnderecoChange={setEnderecoId}
          onProximo={() => setEtapa("pagamento")}
          onVoltar={() => setEtapa("produtos")}
        />
      )}
      {etapa === "pagamento" && (
        <EtapaPagamento
          token={token}
          pagamento={pagamento}
          totalSacola={totalSacola}
          onPagamentoChange={setPagamento}
          onVoltar={() => setEtapa("cliente")}
          onProximo={() => setEtapa("resumo")}
        />
      )}
      {etapa === "resumo" && cliente && pagamento && (
        <ResumoConfirmacao
          token={token}
          motoristaId={usuario.id}
          cliente={cliente}
          sacola={sacola}
          pagamento={pagamento}
          onVoltar={() => setEtapa("pagamento")}
          onSucesso={() => setEtapa("sucesso")}
        />
      )}
    </div>
  )
}

const s: Record<string, CSSProperties> = {
  pagina: { minHeight: "100%", background: "#fff" },

  // Steps
  stepsBar: {
    display: "flex",
    alignItems: "center",       // alinha tudo no centro vertical
    background: "#fff",
    borderBottom: "1px solid #F3F4F6",
    padding: "12px 16px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  },
  stepWrapper: {
    display: "flex",
    alignItems: "center",       // linha e bolinha na mesma altura
    flex: 1,
  },
  linha: {
    flex: 1,
    height: "2px",
    borderRadius: "1px",
    minWidth: "8px",
  },
  stepItem: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "4px",
    flexShrink: 0,
  },
  bolinha: {
    width: "26px",
    height: "26px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  check: { fontSize: "13px", color: "#fff", fontWeight: 700, lineHeight: 1 },
  num:   { fontSize: "12px", fontWeight: 600, lineHeight: 1 },
  stepLabel: {
    fontSize: "10px",
    letterSpacing: "0.2px",
    whiteSpace: "nowrap" as const,
  },

  // Sucesso
  sucesso: {
    display: "flex", flexDirection: "column" as const,
    alignItems: "center", justifyContent: "center",
    minHeight: "60vh", padding: "2rem", gap: "0.75rem", background: "#fff",
  },
  sucessoIcone: {
    width: "64px", height: "64px", borderRadius: "50%",
    background: "#EA1D2C", color: "#fff", fontSize: "28px",
    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
  },
  sucessoTitulo: { fontSize: "20px", fontWeight: 700, color: "#111827", margin: 0 },
  sucessoSub:    { fontSize: "14px", color: "#6B7280", margin: 0 },
  btnNova: {
    marginTop: "1rem", background: "#EA1D2C", color: "#fff",
    border: "none", borderRadius: "12px", padding: "14px 32px",
    fontSize: "16px", fontWeight: 600, cursor: "pointer",
  },
}
