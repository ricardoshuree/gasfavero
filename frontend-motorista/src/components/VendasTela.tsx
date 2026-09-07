// [mcp-local harness] feature: fix-visual-steps-malote-hub | plano: 5083bdc4 | 2026-09-07 18:46:06
// Steps no estilo iFood: fundo branco, step ativo vermelho #EA1D2C com texto branco, passados com check verde, futuros cinza claro
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

  const etapaAtualIdx = ETAPAS.indexOf(etapa as Etapa)

  return (
    <div style={s.pagina}>

      {/* ── Barra de steps estilo iFood ── */}
      <div style={s.stepsBar}>
        {ETAPAS.map((e, idx) => {
          const ativo  = idx === etapaAtualIdx
          const passado = idx < etapaAtualIdx
          const futuro  = idx > etapaAtualIdx

          // Separador entre steps (exceto antes do primeiro)
          const separador = idx > 0 && (
            <div style={{
              ...s.separador,
              background: idx <= etapaAtualIdx ? "#EA1D2C" : "#E5E7EB",
            }} />
          )

          return (
            <div key={e} style={s.stepWrapper}>
              {separador}
              <div style={s.stepItem}>
                {/* Bolinha */}
                <div style={{
                  ...s.bolinha,
                  background: ativo ? "#EA1D2C" : passado ? "#EA1D2C" : "#E5E7EB",
                  border: ativo ? "2px solid #EA1D2C" : passado ? "2px solid #EA1D2C" : "2px solid #D1D5DB",
                }}>
                  {passado
                    ? <span style={s.bolinhaCheck}>✓</span>
                    : <span style={{ ...s.bolinhaNum, color: ativo ? "#fff" : "#9CA3AF" }}>
                        {idx + 1}
                      </span>
                  }
                </div>
                {/* Label */}
                <span style={{
                  ...s.stepLabel,
                  color: ativo ? "#EA1D2C" : passado ? "#374151" : "#9CA3AF",
                  fontWeight: ativo ? 700 : futuro ? 400 : 500,
                }}>
                  {ETAPA_LABEL[e]}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Etapas */}
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

  // ── Steps bar ──
  stepsBar: {
    display: "flex",
    alignItems: "center",
    background: "#fff",
    borderBottom: "1px solid #F3F4F6",
    padding: "12px 16px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  },
  stepWrapper: {
    display: "flex",
    alignItems: "center",
    flex: 1,
  },
  separador: {
    height: "2px",
    flex: 1,
    minWidth: "8px",
    borderRadius: "1px",
  },
  stepItem: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "3px",
    flexShrink: 0,
  },
  bolinha: {
    width: "24px",
    height: "24px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  bolinhaCheck: {
    fontSize: "13px",
    color: "#fff",
    fontWeight: 700,
    lineHeight: 1,
  },
  bolinhaNum: {
    fontSize: "12px",
    fontWeight: 600,
    lineHeight: 1,
  },
  stepLabel: {
    fontSize: "10px",
    letterSpacing: "0.2px",
  },

  // ── Sucesso ──
  sucesso: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    minHeight: "60vh",
    padding: "2rem",
    gap: "0.75rem",
    background: "#fff",
  },
  sucessoIcone: {
    width: "64px", height: "64px",
    borderRadius: "50%",
    background: "#EA1D2C",
    color: "#fff",
    fontSize: "28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
  },
  sucessoTitulo: { fontSize: "20px", fontWeight: 700, color: "#111827", margin: 0 },
  sucessoSub:    { fontSize: "14px", color: "#6B7280", margin: 0 },
  btnNova: {
    marginTop: "1rem",
    background: "#EA1D2C",
    color: "#fff",
    border: "none",
    borderRadius: "12px",
    padding: "14px 32px",
    fontSize: "16px",
    fontWeight: 600,
    cursor: "pointer",
  },
}
