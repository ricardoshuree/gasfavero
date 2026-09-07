// [mcp-local harness] feature: financeiro-hub-menu | plano: 1a49a4e6 | 2026-09-07 18:23:00
// Hub do módulo Financeiro — blocos de menu no estilo aprovado pelo Giovani (v1.0). Cada bloco navega para a sub-tela correspondente via onNavegar.
// Hub do módulo Financeiro
// Tela de entrada com blocos de menu — estilo aprovado pelo Giovani (v1.0)
// Cada bloco chama onNavegar() com o id da sub-tela correspondente
import type { CSSProperties } from "react"
import { CORES_APP as C } from "../theme"

export type SubTelaFinanceiro =
  | "livro"
  | "recebimento_vale"
  | "inadimplentes"
  | "malote"
  | "cascos"

interface Bloco {
  id: SubTelaFinanceiro
  titulo: string
  descricao: string
  emoji: string
}

const BLOCOS: Bloco[] = [
  {
    id: "livro",
    titulo: "Livro de Vendas",
    descricao: "Só as vendas feitas por você",
    emoji: "📋",
  },
  {
    id: "recebimento_vale",
    titulo: "Recebimento de Vale",
    descricao: "Só os vales dos seus clientes",
    emoji: "📄",
  },
  {
    id: "inadimplentes",
    titulo: "Inadimplentes",
    descricao: "Seus clientes em atraso há mais de 30 dias",
    emoji: "⏳",
  },
  {
    id: "malote",
    titulo: "Malote Motorista",
    descricao: "Fechamento de caixa do dia",
    emoji: "💼",
  },
  {
    id: "cascos",
    titulo: "Devolução de Cascos",
    descricao: "Botijões emprestados que precisam voltar",
    emoji: "🔄",
  },
]

interface Props {
  onNavegar: (tela: SubTelaFinanceiro) => void
}

export default function FinanceiroHub({ onNavegar }: Props) {
  return (
    <div style={s.pagina}>
      <h2 style={s.titulo}>Financeiro</h2>
      <div style={s.lista}>
        {BLOCOS.map(b => (
          <button key={b.id} style={s.bloco} onClick={() => onNavegar(b.id)}>
            <span style={s.emoji}>{b.emoji}</span>
            <div style={s.texto}>
              <div style={s.blocoTitulo}>{b.titulo}</div>
              <div style={s.blocoDesc}>{b.descricao}</div>
            </div>
            <span style={s.seta}>›</span>
          </button>
        ))}
      </div>
    </div>
  )
}

const s: Record<string, CSSProperties> = {
  pagina: {
    background: C.fundo,
    minHeight: "100%",
    padding: "20px 16px 80px",
  },
  titulo: {
    fontSize: "22px",
    fontWeight: 700,
    color: C.texto,
    margin: "0 0 20px",
  },
  lista: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  bloco: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    background: "#fff",
    border: `1px solid ${C.borda}`,
    borderRadius: "14px",
    padding: "16px 14px",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
    boxSizing: "border-box",
  },
  emoji: {
    fontSize: "22px",
    flexShrink: 0,
    width: "32px",
    textAlign: "center",
  },
  texto: {
    flex: 1,
  },
  blocoTitulo: {
    fontSize: "15px",
    fontWeight: 600,
    color: C.texto,
    marginBottom: "3px",
  },
  blocoDesc: {
    fontSize: "12px",
    color: C.textoSecundario,
  },
  seta: {
    fontSize: "20px",
    color: C.textoSecundario,
    flexShrink: 0,
  },
}
