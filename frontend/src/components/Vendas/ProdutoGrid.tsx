// [mcp-local harness] feature: fluxo-vendas-distribuidora-frontend | plano: b8adcd52 | 2026-08-05 10:39:58
// Grid de botoes quadrados de produto, com estado selecionado/quantidade
import { Flame } from "lucide-react"

import type { ProdutoComPrecoPublic } from "@/client"
import { cn } from "@/lib/utils"

interface ProdutoGridProps {
  produtos: ProdutoComPrecoPublic[]
  quantidadesNaSacola: Record<string, number>
  onSelect: (produto: ProdutoComPrecoPublic) => void
}

function formatMoney(valor: string | null | undefined): string {
  if (!valor) return "—"
  const numero = Number(valor)
  if (Number.isNaN(numero)) return valor
  return numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

/**
 * Botões quadrados de produto -- clicar adiciona à sacola (ou soma +1
 * se já estiver lá). Fica "afundado"/mais claro enquanto tiver
 * unidades na sacola, imitando o rascunho do Ricardo.
 *
 * Sem imagem customizável por produto ainda (ícone genérico fixo) --
 * fica como próximo passo se vocês quiserem upload de imagem por
 * produto, isso precisa de armazenamento de arquivo (não modelado
 * ainda).
 */
export function ProdutoGrid({ produtos, quantidadesNaSacola, onSelect }: ProdutoGridProps) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
      {produtos.map((produto) => {
        const quantidade = quantidadesNaSacola[produto.id] ?? 0
        const semPreco = !produto.preco_atual
        return (
          <button
            key={produto.id}
            type="button"
            disabled={semPreco}
            onClick={() => onSelect(produto)}
            className={cn(
              "relative flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 p-2 transition-all",
              quantidade > 0
                ? "border-primary bg-primary/20 translate-y-0.5 shadow-inner"
                : "border-border bg-card hover:border-primary/50",
              semPreco && "cursor-not-allowed opacity-40",
            )}
            title={semPreco ? "Produto sem preço cadastrado" : formatMoney(produto.preco_atual)}
          >
            {quantidade > 0 && (
              <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {quantidade}
              </span>
            )}
            <Flame className="h-6 w-6" />
            <span className="text-sm font-semibold">{produto.title}</span>
            <span className="text-xs text-muted-foreground">
              {formatMoney(produto.preco_atual)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default ProdutoGrid
