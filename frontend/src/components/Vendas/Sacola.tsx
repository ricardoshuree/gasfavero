// [mcp-local harness] feature: fluxo-vendas-distribuidora-frontend | plano: b8adcd52 | 2026-08-05 10:40:20
// Lista da sacola de compras com quantidade e total
import { Minus, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"

export interface SacolaItem {
  produtoId: string
  title: string
  precoUnitario: string
  quantidade: number
}

interface SacolaProps {
  itens: SacolaItem[]
  onIncrementar: (produtoId: string) => void
  onDecrementar: (produtoId: string) => void
  onRemover: (produtoId: string) => void
}

function formatMoney(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function Sacola({ itens, onIncrementar, onDecrementar, onRemover }: SacolaProps) {
  const total = itens.reduce(
    (acc, item) => acc + Number(item.precoUnitario) * item.quantidade,
    0,
  )

  if (itens.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Sacola vazia -- clique num produto pra adicionar
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-col gap-2">
        {itens.map((item) => (
          <div
            key={item.produtoId}
            className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatMoney(Number(item.precoUnitario))} un.
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => onDecrementar(item.produtoId)}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <span className="w-6 text-center text-sm font-medium">
                {item.quantidade}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => onIncrementar(item.produtoId)}
              >
                <Plus className="h-3 w-3" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                onClick={() => onRemover(item.produtoId)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <span className="w-24 shrink-0 text-right text-sm font-semibold">
              {formatMoney(Number(item.precoUnitario) * item.quantidade)}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t pt-2">
        <span className="font-semibold">Total</span>
        <span className="text-lg font-bold">{formatMoney(total)}</span>
      </div>
    </div>
  )
}

export default Sacola
