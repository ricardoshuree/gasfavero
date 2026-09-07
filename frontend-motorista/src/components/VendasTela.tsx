// [mcp-local harness] feature: fix-steps-layout-definitivo | plano: 4e89ea9b | 2026-09-07 19:59:15
// Steps com grid layout definitivo: bolinhas e linhas no mesmo grid, marginBottom compensa o label para alinhar linha com centro da bolinha
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
  produtos: "Produtos", cliente: "Cliente",
  pagamento: "Pagamento", resumo: "Resumo", sucesso: "",
}

const VERMELHO = "#EA1D2C"

interface Props {
  token: string
  usuario: UserMe
}

// ── Barra de steps estilo iFood ──────────────────────────────────────────────
// Abordagem: container com `display:grid` de N colunas onde
// colunas ímpares = bolinha (largura fixa) e colunas pares = linha (flex-grow).
// Isso garante que bolinhas e linhas compartilhem exatamente o mesmo eixo central.
function StepsBar({ etapaAtual }: { etapaAtual: Etapa }) {
  const idx = ETAPAS.indexOf(etapaAtual)

  // Monta as colunas do grid: "auto 1fr auto 1fr auto 1fr auto"
  const gridCols = ETAPAS.map((_, i) =>
    i < ETAPAS.length - 1 ? "auto 1fr" : "auto"
  ).join(" ")

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: gridCols,
      alignItems: "center",
      background: "#fff",
      borderBottom: "1px solid #F3F4F6",
      padding: "10px 16px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      gap: 0,
    }}>
      {ETAPAS.map((e, i) => {
        const ativo   = i === idx
        const passado = i < idx
        const futuro  = i > idx
        const cor     = (ativo || passado) ? VERMELHO : "#E5E7EB"

        return [
          // Bolinha + label
          <div key={`step-${i}`} style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "3px",
          }}>
            <div style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              background: cor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}>
              {passado
                ? <span style={{ color: "#fff", fontSize: "13px", fontWeight: 700, lineHeight: 1 }}>✓</span>
                : <span style={{ color: ativo ? "#fff" : "#9CA3AF", fontSize: "11px", fontWeight: 600, lineHeight: 1 }}>{i + 1}</span>
              }
            </div>
            <span style={{
              fontSize: "9px",
              whiteSpace: "nowrap" as const,
              color: ativo ? VERMELHO : passado ? "#6B7280" : "#9CA3AF",
              fontWeight: ativo ? 700 : 400,
              letterSpacing: "0.1px",
            }}>
              {ETAPA_LABEL[e]}
            </span>
          </div>,

          // Linha separadora (só entre steps, não após o último)
          i < ETAPAS.length - 1 && (
            <div key={`linha-${i}`} style={{
              height: "2px",
              background: i < idx ? VERMELHO : "#E5E7EB",
              margin: "0 4px",
              // Empurra para cima para alinhar com o centro da bolinha (bolinha 24px + label ~14px ≈ centralizar na bolinha)
              marginBottom: "17px",
            }} />
          ),
        ]
      })}
    </div>
  )
}

export default function VendasTela({ token, usuario }: Props) {
  const [etapa, setEtapa] = useState<Etapa>("produtos")
  const [sacola, setSacola] = useState<ItemSacola[]>([])
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [enderecoId, setEnderecoId] = useState<string | null>(null)
  const [pagamento, setPagamento] = useState<DadosPagamento | null>(null)

  const totalSacola = sacola.reduce((acc, i) => acc + Number(i.precoUnitario) * i.quantidade, 0)

  function resetar() {
    setSacola([]); setCliente(null); setEnderecoId(null); setPagamento(null); setEtapa("produtos")
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

  return (
    <div style={s.pagina}>
      <StepsBar etapaAtual={etapa} />

      {etapa === "produtos" && (
        <EtapaProdutos token={token} sacola={sacola} onSacolaChange={setSacola} onProximo={() => setEtapa("cliente")} />
      )}
      {etapa === "cliente" && (
        <EtapaCliente
          token={token} clienteSelecionado={cliente} enderecoId={enderecoId}
          onClienteChange={c => { setCliente(c); if (c?.endereco?.id) setEnderecoId(c.endereco.id) }}
          onEnderecoChange={setEnderecoId}
          onProximo={() => setEtapa("pagamento")} onVoltar={() => setEtapa("produtos")}
        />
      )}
      {etapa === "pagamento" && (
        <EtapaPagamento
          token={token} pagamento={pagamento} totalSacola={totalSacola}
          onPagamentoChange={setPagamento}
          onVoltar={() => setEtapa("cliente")} onProximo={() => setEtapa("resumo")}
        />
      )}
      {etapa === "resumo" && cliente && pagamento && (
        <ResumoConfirmacao
          token={token} motoristaId={usuario.id}
          cliente={cliente} sacola={sacola} pagamento={pagamento}
          onVoltar={() => setEtapa("pagamento")} onSucesso={() => setEtapa("sucesso")}
        />
      )}
    </div>
  )
}

const s: Record<string, CSSProperties> = {
  pagina: { minHeight: "100%", background: "#fff" },
  sucesso: {
    display: "flex", flexDirection: "column" as const, alignItems: "center",
    justifyContent: "center", minHeight: "60vh", padding: "2rem", gap: "0.75rem", background: "#fff",
  },
  sucessoIcone: {
    width: "64px", height: "64px", borderRadius: "50%", background: VERMELHO, color: "#fff",
    fontSize: "28px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
  },
  sucessoTitulo: { fontSize: "20px", fontWeight: 700, color: "#111827", margin: 0 },
  sucessoSub:    { fontSize: "14px", color: "#6B7280", margin: 0 },
  btnNova: {
    marginTop: "1rem", background: VERMELHO, color: "#fff", border: "none",
    borderRadius: "12px", padding: "14px 32px", fontSize: "16px", fontWeight: 600, cursor: "pointer",
  },
}
