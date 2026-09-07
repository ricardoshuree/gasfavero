// [mcp-local harness] feature: vendas-motorista | plano: d865e550 | 2026-09-07 12:15:21
// VendasTela: orquestrador do fluxo 4 etapas com indicador de progresso e tela de sucesso
// VendasTela — orquestra o fluxo de 4 etapas (produtos → cliente → pagamento → resumo)
// O motorista logado é identificado automaticamente; sem combo de atribuição.
import { useState, type CSSProperties } from "react"
import { CORES_APP as C } from "../theme"
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
        <button style={s.btnNova} onClick={resetar}>
          + Nova venda
        </button>
      </div>
    )
  }

  return (
    <div style={s.pagina}>
      {/* Indicador de etapas */}
      <div style={s.steps}>
        {ETAPAS.map((e, idx) => {
          const etapaAtualIdx = ETAPAS.indexOf(etapa as Etapa)
          const ativo = e === etapa
          const passado = idx < etapaAtualIdx
          return (
            <div key={e} style={{ ...s.step, ...(ativo ? s.stepAtivo : passado ? s.stepPassado : {}) }}>
              {ETAPA_LABEL[e]}
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
  pagina: { minHeight: "100%", background: C.fundo },
  steps: {
    display: "flex",
    background: "#1e2912",
    padding: "8px 12px",
    gap: "4px",
  },
  step: {
    flex: 1,
    textAlign: "center" as const,
    fontSize: "12px",
    padding: "5px 4px",
    borderRadius: "6px",
    color: "#C5C9A4",
    fontWeight: 400,
  },
  stepAtivo: {
    background: "#606C38",
    color: "#F8FAFC",
    fontWeight: 600,
  },
  stepPassado: {
    color: "#8aab6a",
  },
  sucesso: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    minHeight: "60vh",
    padding: "2rem",
    gap: "0.75rem",
  },
  sucessoIcone: {
    width: "64px", height: "64px",
    borderRadius: "50%",
    background: "#606C38",
    color: "#F8FAFC",
    fontSize: "28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
  },
  sucessoTitulo: { fontSize: "20px", fontWeight: 700, color: C.texto, margin: 0 },
  sucessoSub: { fontSize: "14px", color: C.textoSecundario, margin: 0 },
  btnNova: {
    marginTop: "1rem",
    background: "#606C38",
    color: "#F8FAFC",
    border: "none",
    borderRadius: "12px",
    padding: "14px 32px",
    fontSize: "16px",
    fontWeight: 600,
    cursor: "pointer",
  },
}
