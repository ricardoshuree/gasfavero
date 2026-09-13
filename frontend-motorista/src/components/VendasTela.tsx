// [mcp-local harness] feature: pagamento-mix | plano: 4bbb8629 | 2026-09-13 15:16:06
// VendasTela: passa token e motoristaId para EtapaPagamento
// VendasTela: orquestrador do fluxo 4 etapas
// Ordem: cliente → produtos → pagamento → resumo
// chamadoInicial: quando vem de um chamado concluído, pré-preenche EtapaCliente
import { useState, type CSSProperties } from "react"
import type { UserMe } from "../lib/auth"
import type { DemandaVendaPublic } from "../lib/demandas"
import type { CascoEmprestimo, Cliente, DadosPagamento, ItemSacola } from "../lib/vendas"
import EtapaCliente from "./vendas/EtapaCliente"
import EtapaPagamento from "./vendas/EtapaPagamento"
import EtapaProdutos from "./vendas/EtapaProdutos"
import ResumoConfirmacao from "./vendas/ResumoConfirmacao"

type Etapa = "cliente" | "produtos" | "pagamento" | "resumo" | "sucesso"

const ETAPAS: Etapa[] = ["cliente", "produtos", "pagamento", "resumo"]
const ETAPA_LABEL: Record<Etapa, string> = {
  cliente: "Cliente", produtos: "Produtos",
  pagamento: "Pagamento", resumo: "Resumo", sucesso: "",
}

const VERMELHO = "#EA1D2C"

interface Props {
  token: string
  usuario: UserMe
  chamadoInicial?: DemandaVendaPublic | null
  aoFinalizarVenda?: () => void
}

function StepsBar({ etapaAtual }: { etapaAtual: Etapa }) {
  const idx = ETAPAS.indexOf(etapaAtual)
  const gridCols = ETAPAS.map((_, i) => i < ETAPAS.length - 1 ? "auto 1fr" : "auto").join(" ")

  return (
    <div style={{ display: "grid", gridTemplateColumns: gridCols, alignItems: "center", background: "#fff", borderBottom: "1px solid #F3F4F6", padding: "10px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      {ETAPAS.map((e, i) => {
        const ativo   = i === idx
        const passado = i < idx
        const cor     = (ativo || passado) ? VERMELHO : "#E5E7EB"
        return [
          <div key={`step-${i}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}>
            <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: cor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {passado
                ? <span style={{ color: "#fff", fontSize: "13px", fontWeight: 700, lineHeight: 1 }}>✓</span>
                : <span style={{ color: ativo ? "#fff" : "#9CA3AF", fontSize: "11px", fontWeight: 600, lineHeight: 1 }}>{i + 1}</span>
              }
            </div>
            <span style={{ fontSize: "9px", whiteSpace: "nowrap" as const, color: ativo ? VERMELHO : passado ? "#6B7280" : "#9CA3AF", fontWeight: ativo ? 700 : 400, letterSpacing: "0.1px" }}>
              {ETAPA_LABEL[e]}
            </span>
          </div>,
          i < ETAPAS.length - 1 && (
            <div key={`linha-${i}`} style={{ height: "2px", background: i < idx ? VERMELHO : "#E5E7EB", margin: "0 4px", marginBottom: "17px" }} />
          ),
        ]
      })}
    </div>
  )
}

export default function VendasTela({ token, usuario, chamadoInicial, aoFinalizarVenda }: Props) {
  const [etapa, setEtapa] = useState<Etapa>("cliente")
  const [sacola, setSacola] = useState<ItemSacola[]>([])
  const [cascos, setCascos] = useState<CascoEmprestimo[]>([])
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [enderecoId, setEnderecoId] = useState<string | null>(null)
  const [pagamento, setPagamento] = useState<DadosPagamento | null>(null)

  const totalSacola = sacola.reduce((acc, i) => {
    const gas = Number(i.precoUnitario) * i.quantidade
    const casco = i.comCasco && i.precoCascoAtual ? Number(i.precoCascoAtual) * i.quantidade : 0
    return acc + gas + casco
  }, 0)

  function resetar() {
    setSacola([])
    setCascos([])
    setCliente(null)
    setEnderecoId(null)
    setPagamento(null)
    setEtapa("cliente")
    aoFinalizarVenda?.()
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

      {etapa === "cliente" && (
        <EtapaCliente
          token={token}
          clienteSelecionado={cliente}
          enderecoId={enderecoId}
          clienteIdInicial={chamadoInicial?.cliente_id ?? null}
          enderecoIdInicial={chamadoInicial?.endereco?.id ?? null}
          onClienteChange={c => { setCliente(c); if (c?.endereco?.id) setEnderecoId(c.endereco.id) }}
          onEnderecoChange={setEnderecoId}
          onProximo={() => setEtapa("produtos")}
          onVoltar={null}
        />
      )}
      {etapa === "produtos" && (
        <EtapaProdutos
          token={token}
          sacola={sacola}
          cascos={cascos}
          onSacolaChange={setSacola}
          onCascosChange={setCascos}
          onProximo={() => setEtapa("pagamento")}
          onVoltar={() => setEtapa("cliente")}
        />
      )}
      {etapa === "pagamento" && (
        <EtapaPagamento
          token={token}
          motoristaId={usuario.id}
          pagamento={pagamento}
          totalSacola={totalSacola}
          onPagamentoChange={setPagamento}
          onVoltar={() => setEtapa("produtos")}
          onProximo={() => setEtapa("resumo")}
        />
      )}
      {etapa === "resumo" && cliente && pagamento && (
        <ResumoConfirmacao
          token={token}
          motoristaId={usuario.id}
          cliente={cliente}
          enderecoId={enderecoId}
          sacola={sacola}
          cascos={cascos}
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
  sucesso: { display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", minHeight: "60vh", padding: "2rem", gap: "0.75rem", background: "#fff" },
  sucessoIcone: { width: "64px", height: "64px", borderRadius: "50%", background: VERMELHO, color: "#fff", fontSize: "28px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 },
  sucessoTitulo: { fontSize: "20px", fontWeight: 700, color: "#111827", margin: 0 },
  sucessoSub:    { fontSize: "14px", color: "#6B7280", margin: 0 },
  btnNova: { marginTop: "1rem", background: VERMELHO, color: "#fff", border: "none", borderRadius: "12px", padding: "14px 32px", fontSize: "16px", fontWeight: 600, cursor: "pointer" },
}
