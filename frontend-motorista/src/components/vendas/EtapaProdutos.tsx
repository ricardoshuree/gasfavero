// [mcp-local harness] feature: fix-visual-contraste-motorista | plano: 434ba222 | 2026-09-08 09:27:24
// EtapaProdutos: instrução e preços em #111, borda cards #9CA3AF, sacola com borda #374151 e texto escuro
// Etapa 1 — Seleção de produtos com sacola inline
// Ajustes de contraste: instrução, preços e sacola mais escuros; bordas mais visíveis
import { useEffect, useState, type CSSProperties } from "react"
import { CORES_APP as C } from "../../theme"
import { buscarProdutos, type ItemSacola, type Produto } from "../../lib/vendas"

interface Props {
  token: string
  sacola: ItemSacola[]
  onSacolaChange: (sacola: ItemSacola[]) => void
  onProximo: () => void
}

export default function EtapaProdutos({ token, sacola, onSacolaChange, onProximo }: Props) {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState("")

  useEffect(() => {
    buscarProdutos(token)
      .then(setProdutos)
      .catch(() => setErro("Não foi possível carregar os produtos."))
      .finally(() => setCarregando(false))
  }, [token])

  function qtdNaSacola(produtoId: string): number {
    return sacola.find(i => i.produtoId === produtoId)?.quantidade ?? 0
  }

  function adicionar(produto: Produto) {
    if (!produto.preco_atual) return
    onSacolaChange(
      sacola.some(i => i.produtoId === produto.id)
        ? sacola.map(i => i.produtoId === produto.id ? { ...i, quantidade: i.quantidade + 1 } : i)
        : [...sacola, { produtoId: produto.id, titulo: produto.title, precoUnitario: produto.preco_atual, quantidade: 1 }]
    )
  }

  function remover(produtoId: string) {
    onSacolaChange(
      sacola.flatMap(i => {
        if (i.produtoId !== produtoId) return [i]
        if (i.quantidade <= 1) return []
        return [{ ...i, quantidade: i.quantidade - 1 }]
      })
    )
  }

  const total = sacola.reduce((acc, i) => acc + Number(i.precoUnitario) * i.quantidade, 0)
  const totalItens = sacola.reduce((acc, i) => acc + i.quantidade, 0)

  return (
    <div style={s.pagina}>
      {/* Instrução em preto para máximo contraste */}
      <p style={s.instrucao}>Toque para adicionar à sacola</p>

      {carregando && <p style={s.info}>Carregando produtos...</p>}
      {erro && <p style={s.erro}>{erro}</p>}

      <div style={s.grid}>
        {produtos.filter(p => p.preco_atual).map(produto => {
          const qtd = qtdNaSacola(produto.id)
          return (
            <div
              key={produto.id}
              style={{ ...s.card, ...(qtd > 0 ? s.cardSel : {}) }}
              onClick={() => adicionar(produto)}
            >
              {qtd > 0 && <div style={s.badge}>{qtd}</div>}
              <div style={s.prodNome}>{produto.title}</div>
              {/* Preço em preto — fácil de ler para motoristas com dificuldade visual */}
              <div style={s.prodPreco}>
                R$ {Number(produto.preco_atual).toFixed(2).replace(".", ",")}
              </div>
              {qtd > 0 && (
                <button
                  style={s.btnRemover}
                  onClick={e => { e.stopPropagation(); remover(produto.id) }}
                >
                  −
                </button>
              )}
            </div>
          )
        })}
      </div>

      {totalItens > 0 && (
        <>
          {/* Sacola com texto e borda escuros */}
          <div style={s.sacola}>
            <span style={s.sacolaInfo}>🛒 {totalItens} {totalItens === 1 ? "item" : "itens"}</span>
            <span style={s.sacolaValor}>R$ {total.toFixed(2).replace(".", ",")}</span>
          </div>
          <button style={s.btnProximo} onClick={onProximo}>
            Próximo →
          </button>
        </>
      )}
    </div>
  )
}

const s: Record<string, CSSProperties> = {
  pagina:    { padding: "0.75rem 1rem 1.5rem" },
  // Instrução em preto sólido para máximo contraste
  instrucao: { fontSize: "0.85rem", color: "#111111", fontWeight: 500, margin: "0 0 0.75rem" },
  info:      { color: C.textoSecundario, fontSize: "0.9rem", textAlign: "center", padding: "2rem 0" },
  erro:      { color: C.erro, fontSize: "0.875rem", textAlign: "center", padding: "1rem 0" },
  grid:      { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" },
  card: {
    background: "#fff",
    border: "1.5px solid #9CA3AF",   // borda cinza médio — mais visível que antes
    borderRadius: "12px",
    padding: "14px 12px",
    cursor: "pointer",
    position: "relative",
    userSelect: "none",
    minHeight: "72px",
  },
  cardSel: {
    border: "2.5px solid #606C38",
    background: "#f0f4eb",
  },
  badge: {
    position: "absolute",
    top: "8px",
    right: "8px",
    background: "#606C38",
    color: "#F8FAFC",
    fontSize: "12px",
    fontWeight: 700,
    width: "22px",
    height: "22px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  prodNome:  { fontSize: "15px", fontWeight: 700, color: "#111111", marginBottom: "4px" },
  // Preço em preto para contraste máximo
  prodPreco: { fontSize: "14px", fontWeight: 600, color: "#111111" },
  btnRemover: {
    position: "absolute",
    bottom: "8px",
    right: "8px",
    background: "#E5E7EB",
    border: "none",
    borderRadius: "50%",
    width: "24px",
    height: "24px",
    fontSize: "16px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#111111",
    padding: 0,
  },
  sacola: {
    marginTop: "1rem",
    background: "#fff",
    border: "1.5px solid #374151",   // borda escura — área bem delimitada
    borderRadius: "12px",
    padding: "12px 14px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sacolaInfo:  { fontSize: "14px", color: "#111111", fontWeight: 600 },
  sacolaValor: { fontSize: "16px", fontWeight: 700, color: "#111111" },
  btnProximo: {
    display: "block",
    width: "100%",
    marginTop: "12px",
    background: "#606C38",
    color: "#F8FAFC",
    border: "none",
    borderRadius: "12px",
    padding: "14px",
    fontSize: "16px",
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "center",
  },
}
