// [mcp-local harness] feature: venda_casco_regras | plano: 90951188 | 2026-09-09 13:48:23
// PainelCasco filtra fora produtos com com_casco=true — casco já comprado não precisa de empréstimo
/**
 * PainelCasco — painel âmbar abaixo da Sacola.
 *
 * Exibe stepper de empréstimo apenas para produtos que NÃO têm
 * casco incluído na venda (com_casco=false). Produtos com casco
 * já comprado não precisam de empréstimo.
 */
import { Minus, Package, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"

export interface CascoItem {
  produto_id: string
  quantidade: number
}

interface SacolaItemMin {
  produtoId: string
  title: string
  quantidade: number
  comCasco?: boolean
}

interface PainelCascoProps {
  itens: SacolaItemMin[]
  cascos: CascoItem[]
  onChange: (cascos: CascoItem[]) => void
}

function getQtd(cascos: CascoItem[], produtoId: string): number {
  return cascos.find((c) => c.produto_id === produtoId)?.quantidade ?? 0
}

function setQtd(cascos: CascoItem[], produtoId: string, qtd: number): CascoItem[] {
  const sem = cascos.filter((c) => c.produto_id !== produtoId)
  if (qtd <= 0) return sem
  return [...sem, { produto_id: produtoId, quantidade: qtd }]
}

export function PainelCasco({ itens, cascos, onChange }: PainelCascoProps) {
  // Exibe somente produtos que NÃO têm casco incluído na venda
  const itensElegiveis = itens.filter((i) => !i.comCasco)

  if (itensElegiveis.length === 0) return null

  const totalCascos = cascos.reduce((acc, c) => acc + c.quantidade, 0)

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30">
      <div className="flex items-center gap-2 border-b border-amber-200 px-3 py-2.5 dark:border-amber-800">
        <Package
          className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden="true"
        />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            Empréstimo de casco
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Informe quantos cascos serão emprestados por produto
          </p>
        </div>
        {totalCascos > 0 && (
          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-800 dark:text-amber-100">
            {totalCascos} casco{totalCascos !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-0 divide-y divide-amber-100 px-3 dark:divide-amber-900">
        {itensElegiveis.map((item) => {
          const qtdCasco = getQtd(cascos, item.produtoId)
          const max = item.quantidade

          return (
            <div key={item.produtoId} className="flex items-center gap-3 py-2.5">
              <span className="flex-1 text-sm text-amber-900 dark:text-amber-100">
                {item.title}
                <span className="ml-1.5 text-xs text-amber-500 dark:text-amber-500">
                  (máx {max})
                </span>
              </span>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 border-amber-300 dark:border-amber-700"
                  disabled={qtdCasco <= 0}
                  onClick={() =>
                    onChange(setQtd(cascos, item.produtoId, qtdCasco - 1))
                  }
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span
                  className={`w-6 text-center text-sm font-semibold ${
                    qtdCasco > 0
                      ? "text-amber-700 dark:text-amber-300"
                      : "text-muted-foreground"
                  }`}
                >
                  {qtdCasco}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 border-amber-300 dark:border-amber-700"
                  disabled={qtdCasco >= max}
                  onClick={() =>
                    onChange(setQtd(cascos, item.produtoId, qtdCasco + 1))
                  }
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              {qtdCasco > 0 ? (
                <span className="w-20 text-right text-xs font-medium text-amber-700 dark:text-amber-300">
                  {qtdCasco} casco{qtdCasco !== 1 ? "s" : ""}
                </span>
              ) : (
                <span className="w-20 text-right text-xs text-muted-foreground">
                  nenhum
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default PainelCasco
