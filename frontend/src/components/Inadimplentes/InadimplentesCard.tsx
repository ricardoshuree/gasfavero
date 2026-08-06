// [mcp-local harness] feature: inadimplentes-frontend | plano: 6440f8fb | 2026-08-06 12:52:16
// Card unico "Atraso maior que 30 dias" (qtd + valor)
// Card único da tela de Inadimplentes -- "Atraso maior que 30 dias"
// (qtd + valor), filtrado pelo escopo ativo do menu (Ano/Mês).
import { Card, CardContent } from "@/components/ui/card"

function formatMoney(valor: string | number): string {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

interface InadimplentesCardProps {
  qtd: number
  valor: string | number
  isLoading?: boolean
}

export function InadimplentesCard({
  qtd,
  valor,
  isLoading,
}: InadimplentesCardProps) {
  if (isLoading) {
    return (
      <div className="h-32 w-full max-w-sm animate-pulse rounded-xl border bg-muted/40" />
    )
  }

  return (
    <Card className="w-full max-w-sm">
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">
          Atraso maior que 30 dias
        </p>
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-md border border-destructive text-2xl font-semibold text-destructive">
            {qtd}
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-semibold text-destructive">
              {formatMoney(valor)}
            </span>
            <span className="text-xs text-muted-foreground">
              {qtd === 1 ? "venda" : "vendas"}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default InadimplentesCard
