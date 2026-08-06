// [mcp-local harness] feature: livro-vendas-frontend-cards | plano: e38222cd | 2026-08-06 09:36:16
// Cards "Em caixa" e "Em aberto" -- mesmo padrao visual do ResumoCards de Recebimento de Vale
// Quadros informativos do Livro de Vendas -- "Em caixa" (vendas já
// pagas) e "Em aberto" (vendas em vale ainda não pagas), ambos
// filtrados pelo período do escopo ativo do menu interativo. Mesmo
// padrão visual do ResumoCards de Recebimento de Vale.
import { Card, CardContent } from "@/components/ui/card"

function formatMoney(valor: string | number): string {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

interface ResumoCardProps {
  titulo: string
  qtd: number
  valor: string | number
  destaque?: "aberto"
}

function ResumoCard({ titulo, qtd, valor, destaque }: ResumoCardProps) {
  return (
    <Card className="flex-1 min-w-[220px]">
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">{titulo}</p>
        <div className="flex items-center gap-4">
          <div
            className={
              "flex h-16 w-16 items-center justify-center rounded-md border text-2xl font-semibold " +
              (destaque === "aberto" ? "border-destructive text-destructive" : "")
            }
          >
            {qtd}
          </div>
          <div className="flex flex-col">
            <span
              className={
                "text-lg font-semibold " +
                (destaque === "aberto" ? "text-destructive" : "")
              }
            >
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

interface LivroVendasCardsProps {
  emCaixaQtd: number
  emCaixaValor: string | number
  emAbertoQtd: number
  emAbertoValor: string | number
  isLoading?: boolean
}

export function LivroVendasCards({
  emCaixaQtd,
  emCaixaValor,
  emAbertoQtd,
  emAbertoValor,
  isLoading,
}: LivroVendasCardsProps) {
  if (isLoading) {
    return (
      <div className="flex flex-wrap gap-4">
        <div className="h-32 flex-1 min-w-[220px] animate-pulse rounded-xl border bg-muted/40" />
        <div className="h-32 flex-1 min-w-[220px] animate-pulse rounded-xl border bg-muted/40" />
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-stretch gap-4">
      <ResumoCard titulo="Em caixa" qtd={emCaixaQtd} valor={emCaixaValor} />
      <ResumoCard
        titulo="Em aberto"
        qtd={emAbertoQtd}
        valor={emAbertoValor}
        destaque="aberto"
      />
    </div>
  )
}

export default LivroVendasCards
