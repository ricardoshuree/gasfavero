// [mcp-local harness] feature: frontend-motorista-redesign-ifood | plano: 46dc14df | 2026-08-07 19:19:25
// Placeholder Financeiro estilo iFood -- cards cinza claro sobre fundo branco
import type { CSSProperties } from "react"
import { CORES_APP as CORES } from "../theme"

const ITENS = [
  { titulo: "Livro de Vendas", descricao: "Só as vendas feitas por você" },
  { titulo: "Recebimento de Vale", descricao: "Só os vales dos seus clientes" },
  { titulo: "Inadimplentes", descricao: "Seus clientes em atraso há mais de 30 dias" },
  { titulo: "Malote Motorista", descricao: "Fechamento de caixa do dia" },
]

function FinanceiroTela() {
  return (
    <div style={estilos.pagina}>
      <h1 style={estilos.titulo}>Financeiro</h1>
      <div style={estilos.lista}>
        {ITENS.map((item) => (
          <div key={item.titulo} style={estilos.card}>
            <span style={estilos.cardTitulo}>{item.titulo}</span>
            <span style={estilos.cardDescricao}>{item.descricao}</span>
            <span style={estilos.emBreve}>Em construção</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const estilos: Record<string, CSSProperties> = {
  pagina: { padding: "1.25rem 1rem", color: CORES.texto },
  titulo: { fontSize: "1.35rem", fontWeight: 700, margin: "0 0 1rem" },
  lista: { display: "flex", flexDirection: "column", gap: "0.75rem" },
  card: {
    background: CORES.fundoCard,
    border: `1px solid ${CORES.borda}`,
    borderRadius: "0.75rem",
    padding: "1rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.2rem",
  },
  cardTitulo: { fontWeight: 700, fontSize: "1rem", color: CORES.texto },
  cardDescricao: { fontSize: "0.8rem", color: CORES.textoSecundario },
  emBreve: { fontSize: "0.7rem", color: CORES.textoSecundario, marginTop: "0.3rem" },
}

export default FinanceiroTela
