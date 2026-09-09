// [mcp-local harness] feature: venda_casco_produto | plano: 1e4e7de6 | 2026-09-09 12:02:22
// Fix: remove Switch (não existe), usa button nativo; onToggleCasco opcional; tipos explícitos nos handlers
import { Minus, Package, Plus, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export interface SacolaItem {
  produtoId: string
  title: string
  precoUnitario: string
  quantidade: number
  // campos de casco: presentes quando o produto tem vende_casco=true
  vendeCasco?: boolean
  precoCascoAtual?: string | null
  comCasco?: boolean
}

interface SacolaProps {
  itens: SacolaItem[]
  onIncrementar: (produtoId: string) => void
  onDecrementar: (produtoId: string) => void
  onRemover: (produtoId: string) => void
  // opcional: chamado.tsx usa Sacola sem toggle de casco
  onToggleCasco?: (produtoId: string, comCasco: boolean) => void
}

function formatMoney(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function Sacola({
  itens,
  onIncrementar,
  onDecrementar,
  onRemover,
  onToggleCasco,
}: SacolaProps) {
  const totalGas = itens.reduce(
    (acc, item) => acc + Number(item.precoUnitario) * item.quantidade,
    0,
  )
  const totalCasco = itens.reduce((acc, item) => {
    if (item.comCasco && item.precoCascoAtual) {
      return acc + Number(item.precoCascoAtual) * item.quantidade
    }
    return acc
  }, 0)
  const total = totalGas + totalCasco
  const temCasco = totalCasco > 0

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
        {itens.map((item) => {
          const subtotalGas = Number(item.precoUnitario) * item.quantidade
          const subtotalCasco =
            item.comCasco && item.precoCascoAtual
              ? Number(item.precoCascoAtual) * item.quantidade
              : 0
          const subtotalTotal = subtotalGas + subtotalCasco

          return (
            <div key={item.produtoId} className="rounded-md bg-muted/40 px-2 py-1.5">
              {/* linha principal do produto */}
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    {item.comCasco && (
                      <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                        + casco
                      </Badge>
                    )}
                  </div>
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
                  {formatMoney(subtotalTotal)}
                </span>
              </div>

              {/* toggle de casco: só aparece quando onToggleCasco foi passado e produto permite casco */}
              {onToggleCasco && item.vendeCasco && item.precoCascoAtual && (
                <div
                  className={`mt-1.5 flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs transition-colors ${
                    item.comCasco
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                      : "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                  }`}
                  onClick={() =>
                    onToggleCasco(item.produtoId, !item.comCasco)
                  }
                >
                  <Package className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="flex-1">Incluir casco</span>
                  <span className="font-medium">
                    + {formatMoney(Number(item.precoCascoAtual))} ×{" "}
                    {item.quantidade}
                  </span>
                  {/* toggle nativo estilizado — sem dependência de shadcn/switch */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!item.comCasco}
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation()
                      onToggleCasco(item.produtoId, !item.comCasco)
                    }}
                    className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${
                      item.comCasco ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
                        item.comCasco ? "translate-x-3" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* rodapé com total */}
      <div className="flex flex-col gap-0.5 border-t pt-2">
        {temCasco && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Gás</span>
            <span>{formatMoney(totalGas)}</span>
          </div>
        )}
        {temCasco && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Cascos</span>
            <span>{formatMoney(totalCasco)}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="font-semibold">Total</span>
          <span className="text-lg font-bold">{formatMoney(total)}</span>
        </div>
      </div>
    </div>
  )
}

export default Sacola
