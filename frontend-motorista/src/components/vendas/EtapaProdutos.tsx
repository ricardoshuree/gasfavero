// [mcp-local harness] feature: casco-venda-mobile | plano: 6533aabd | 2026-09-13 09:20:14
// EtapaProdutos: toggle "Incluir casco" por produto (compra casco), painel "Empréstimo de casco" (vasilhame emprestado). Props cascos e onCascosChange.
// Etapa 2 — Seleção de produtos com sacola, casco comprado e empréstimo de casco
//
// CASCO COMPRADO (com_casco=true no item):
//   Toggle "+ Incluir casco" — cliente está comprando o casco, adiciona ao total
//   Só aparece se produto.vende_casco=true
//
// CASCO EMPRESTADO (cascos[] na venda):
//   Painel "Empréstimo de casco" abaixo da sacola — motorista emprestou o vasilhame
//   Só aparece se algum produto na sacola com vende_casco=true tiver quantidade > 0
//   Não adiciona valor à venda
import { useEffect, useState, type CSSProperties } from "react"
import { CORES_APP as C } from "../../theme"
import { buscarProdutos, type CascoEmprestimo, type ItemSacola, type Produto } from "../../lib/vendas"

interface Props {
  token: string
  sacola: ItemSacola[]
  cascos: CascoEmprestimo[]
  onSacolaChange: (sacola: ItemSacola[]) => void
  onCascosChange: (cascos: CascoEmprestimo[]) => void
  onProximo: () => void
  onVoltar: () => void
}

const VERDE = "#606C38"

export default function EtapaProdutos({
  token, sacola, cascos,
  onSacolaChange, onCascosChange,
  onProximo, onVoltar,
}: Props) {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState("")

  useEffect(() => {
    buscarProdutos(token)
      .then(setProdutos)
      .catch(() => setErro("Não foi possível carregar os produtos."))
      .finally(() => setCarregando(false))
  }, [token])

  // Remove da sacola produtos que saíram; mantém cascos consistentes
  function limparCascosObsoletos(novaSacola: ItemSacola[], novosCascos: CascoEmprestimo[]) {
    const idsComVendeCasco = new Set(novaSacola.filter(i => i.vendeCasco).map(i => i.produtoId))
    return novosCascos
      .filter(c => idsComVendeCasco.has(c.produto_id))
      .map(c => {
        const item = novaSacola.find(i => i.produtoId === c.produto_id)
        if (!item) return c
        return { ...c, quantidade: Math.min(c.quantidade, item.quantidade) }
      })
      .filter(c => c.quantidade > 0)
  }

  function qtdNaSacola(produtoId: string): number {
    return sacola.find(i => i.produtoId === produtoId)?.quantidade ?? 0
  }

  function adicionar(produto: Produto) {
    if (!produto.preco_atual) return
    const novaSacola = sacola.some(i => i.produtoId === produto.id)
      ? sacola.map(i => i.produtoId === produto.id ? { ...i, quantidade: i.quantidade + 1 } : i)
      : [...sacola, {
          produtoId: produto.id,
          titulo: produto.title,
          precoUnitario: produto.preco_atual!,
          quantidade: 1,
          vendeCasco: produto.vende_casco,
          precoCascoAtual: produto.preco_casco_atual,
          comCasco: false,
        }]
    onSacolaChange(novaSacola)
    onCascosChange(limparCascosObsoletos(novaSacola, cascos))
  }

  function remover(produtoId: string) {
    const novaSacola = sacola.flatMap(i => {
      if (i.produtoId !== produtoId) return [i]
      if (i.quantidade <= 1) return []
      return [{ ...i, quantidade: i.quantidade - 1 }]
    })
    onSacolaChange(novaSacola)
    onCascosChange(limparCascosObsoletos(novaSacola, cascos))
  }

  // Toggle: cliente compra o casco junto (com_casco no item = adiciona ao total)
  function toggleComCasco(produtoId: string, ligar: boolean) {
    onSacolaChange(sacola.map(i =>
      i.produtoId === produtoId ? { ...i, comCasco: ligar } : i
    ))
  }

  // Empréstimo: motorista emprestou o vasilhame (não adiciona ao total)
  function setCascoEmprestimo(produtoId: string, qtd: number) {
    const existente = cascos.find(c => c.produto_id === produtoId)
    if (qtd <= 0) {
      onCascosChange(cascos.filter(c => c.produto_id !== produtoId))
    } else if (existente) {
      onCascosChange(cascos.map(c => c.produto_id === produtoId ? { ...c, quantidade: qtd } : c))
    } else {
      onCascosChange([...cascos, { produto_id: produtoId, quantidade: qtd }])
    }
  }

  function qtdCascoEmprestimo(produtoId: string): number {
    return cascos.find(c => c.produto_id === produtoId)?.quantidade ?? 0
  }

  // Total da sacola: gás + cascos comprados
  const totalSacola = sacola.reduce((acc, i) => {
    const gas = Number(i.precoUnitario) * i.quantidade
    const casco = i.comCasco && i.precoCascoAtual ? Number(i.precoCascoAtual) * i.quantidade : 0
    return acc + gas + casco
  }, 0)
  const totalItens = sacola.reduce((acc, i) => acc + i.quantidade, 0)

  // Itens da sacola que permitem casco (para o painel de empréstimo)
  // Empréstimo só aparece para itens que NÃO incluíram casco na compra
  const itensComVendeCasco = sacola.filter(i => i.vendeCasco && i.quantidade > 0 && !i.comCasco)

  return (
    <div style={s.pagina}>
      <p style={s.instrucao}>Toque para adicionar à sacola</p>

      {carregando && <p style={s.info}>Carregando produtos...</p>}
      {erro && <p style={s.erro}>{erro}</p>}

      {/* Grade de produtos */}
      <div style={s.grid}>
        {produtos.filter(p => p.preco_atual).map(produto => {
          const qtd = qtdNaSacola(produto.id)
          const item = sacola.find(i => i.produtoId === produto.id)
          return (
            <div key={produto.id} style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{ ...s.card, ...(qtd > 0 ? s.cardSel : {}) }}
                onClick={() => adicionar(produto)}
              >
                {qtd > 0 && <div style={s.badge}>{qtd}</div>}
                <div style={s.prodNome}>{produto.title}</div>
                <div style={s.prodPreco}>
                  R$ {Number(produto.preco_atual).toFixed(2).replace(".", ",")}
                </div>
                {qtd > 0 && (
                  <button
                    style={s.btnRemover}
                    onClick={e => { e.stopPropagation(); remover(produto.id) }}
                  >−</button>
                )}
              </div>

              {/* Toggle "Incluir casco" — só para produtos com vende_casco e na sacola */}
              {produto.vende_casco && produto.preco_casco_atual && qtd > 0 && item && (
                <div
                  style={{
                    ...s.toggleCascoRow,
                    background: item.comCasco ? "#f0f4eb" : "#F9FAFB",
                    border: item.comCasco ? `1px solid ${VERDE}` : "1px solid #E5E7EB",
                  }}
                  onClick={() => toggleComCasco(produto.id, !item.comCasco)}
                >
                  <span style={{ fontSize: "11px", color: item.comCasco ? VERDE : "#6B7280", flex: 1, fontWeight: item.comCasco ? 600 : 400 }}>
                    📦 Incluir casco
                  </span>
                  <span style={{ fontSize: "10px", color: item.comCasco ? VERDE : "#9CA3AF" }}>
                    +R$ {Number(produto.preco_casco_atual).toFixed(2).replace(".", ",")}×{qtd}
                  </span>
                  <div style={{
                    width: "28px", height: "16px", borderRadius: "8px",
                    background: item.comCasco ? VERDE : "#D1D5DB",
                    marginLeft: "6px", flexShrink: 0,
                    display: "flex", alignItems: "center",
                    padding: "2px",
                    justifyContent: item.comCasco ? "flex-end" : "flex-start",
                  }}>
                    <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#fff" }} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Resumo da sacola */}
      {totalItens > 0 && (
        <div style={s.sacola}>
          <span style={s.sacolaInfo}>🛒 {totalItens} {totalItens === 1 ? "item" : "itens"}</span>
          <span style={s.sacolaValor}>R$ {totalSacola.toFixed(2).replace(".", ",")}</span>
        </div>
      )}

      {/* Painel de empréstimo de casco (vasilhame emprestado — não cobra) */}
      {itensComVendeCasco.length > 0 && (
        <div style={s.painelEmprestimo}>
          <p style={s.painelTitulo}>📦 Empréstimo de casco (vasilhame)</p>
          <p style={s.painelSub}>Informe quantos cascos foram emprestados — não altera o valor.</p>
          {itensComVendeCasco.map(item => {
            const qtdEmp = qtdCascoEmprestimo(item.produtoId)
            const maxQtd = item.quantidade
            return (
              <div key={item.produtoId} style={s.emprestimoRow}>
                <span style={s.emprestimoNome}>{item.titulo} (máx {maxQtd})</span>
                <div style={s.emprestimoControles}>
                  <button
                    style={{ ...s.btnQtd, opacity: qtdEmp <= 0 ? 0.3 : 1 }}
                    disabled={qtdEmp <= 0}
                    onClick={() => setCascoEmprestimo(item.produtoId, qtdEmp - 1)}
                  >−</button>
                  <span style={s.emprestimoQtd}>{qtdEmp}</span>
                  <button
                    style={{ ...s.btnQtd, opacity: qtdEmp >= maxQtd ? 0.3 : 1 }}
                    disabled={qtdEmp >= maxQtd}
                    onClick={() => setCascoEmprestimo(item.produtoId, qtdEmp + 1)}
                  >+</button>
                </div>
                <span style={{ ...s.emprestimoStatus, color: qtdEmp > 0 ? "#92400e" : "#9CA3AF" }}>
                  {qtdEmp > 0 ? `${qtdEmp} emprestado${qtdEmp > 1 ? "s" : ""}` : "nenhum"}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <div style={s.rodape}>
        <button style={s.btnVoltar} onClick={onVoltar}>← Voltar</button>
        <button
          style={{ ...s.btnProximo, opacity: totalItens > 0 ? 1 : 0.4 }}
          disabled={totalItens === 0}
          onClick={onProximo}
        >
          Próximo →
        </button>
      </div>
    </div>
  )
}

const s: Record<string, CSSProperties> = {
  pagina:    { padding: "0.75rem 1rem 1.5rem" },
  instrucao: { fontSize: "0.85rem", color: "#111111", fontWeight: 500, margin: "0 0 0.75rem" },
  info:      { color: C.textoSecundario, fontSize: "0.9rem", textAlign: "center", padding: "2rem 0" },
  erro:      { color: C.erro, fontSize: "0.875rem", textAlign: "center", padding: "1rem 0" },
  grid:      { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" },
  card: {
    background: "#fff", border: "1.5px solid #9CA3AF",
    borderRadius: "12px", padding: "14px 12px",
    cursor: "pointer", position: "relative",
    userSelect: "none", minHeight: "72px",
  },
  cardSel:   { border: "2.5px solid #606C38", background: "#f0f4eb" },
  badge: {
    position: "absolute", top: "8px", right: "8px",
    background: "#606C38", color: "#F8FAFC",
    fontSize: "12px", fontWeight: 700,
    width: "22px", height: "22px", borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  prodNome:  { fontSize: "15px", fontWeight: 700, color: "#111111", marginBottom: "4px" },
  prodPreco: { fontSize: "14px", fontWeight: 600, color: "#111111" },
  btnRemover: {
    position: "absolute", bottom: "8px", right: "8px",
    background: "#E5E7EB", border: "none", borderRadius: "50%",
    width: "24px", height: "24px", fontSize: "16px",
    cursor: "pointer", display: "flex", alignItems: "center",
    justifyContent: "center", color: "#111111", padding: 0,
  },
  toggleCascoRow: {
    display: "flex", alignItems: "center", gap: "4px",
    borderRadius: "0 0 10px 10px", padding: "5px 8px",
    marginTop: "-2px", cursor: "pointer",
    transition: "background 0.15s",
  },
  sacola: {
    marginTop: "1rem", background: "#fff",
    border: "1.5px solid #374151", borderRadius: "12px",
    padding: "12px 14px", display: "flex",
    justifyContent: "space-between", alignItems: "center",
  },
  sacolaInfo:  { fontSize: "14px", color: "#111111", fontWeight: 600 },
  sacolaValor: { fontSize: "16px", fontWeight: 700, color: "#111111" },
  painelEmprestimo: {
    marginTop: "12px", background: "#fef3c7",
    border: "1px solid #fbbf24", borderRadius: "12px",
    padding: "10px 12px",
  },
  painelTitulo: { fontSize: "12px", fontWeight: 700, color: "#92400e", margin: "0 0 2px" },
  painelSub:    { fontSize: "11px", color: "#92400e", margin: "0 0 8px", opacity: 0.8 },
  emprestimoRow: {
    display: "flex", alignItems: "center", gap: "8px",
    paddingTop: "6px", borderTop: "0.5px solid #fbbf2460",
  },
  emprestimoNome:     { fontSize: "12px", color: "#92400e", flex: 1, fontWeight: 600 },
  emprestimoControles:{ display: "flex", alignItems: "center", gap: "6px" },
  btnQtd: {
    width: "24px", height: "24px", borderRadius: "50%",
    background: "#fff", border: "1px solid #fbbf24",
    color: "#92400e", fontSize: "14px", fontWeight: 700,
    cursor: "pointer", display: "flex", alignItems: "center",
    justifyContent: "center", padding: 0,
  },
  emprestimoQtd:    { fontSize: "13px", fontWeight: 700, color: "#92400e", minWidth: "16px", textAlign: "center" as const },
  emprestimoStatus: { fontSize: "10px", minWidth: "60px", textAlign: "right" as const },
  rodape:    { display: "flex", gap: "10px", marginTop: "12px" },
  btnVoltar: {
    flex: 1, background: "transparent", border: "1.5px solid #374151",
    borderRadius: "12px", padding: "13px", fontSize: "15px",
    color: "#111111", fontWeight: 600, cursor: "pointer",
  },
  btnProximo: {
    flex: 2, display: "block", background: "#606C38", color: "#F8FAFC",
    border: "none", borderRadius: "12px", padding: "14px",
    fontSize: "16px", fontWeight: 600, cursor: "pointer", textAlign: "center",
  },
}


