// [mcp-local harness] feature: cartao-debito-credito | plano: 40efe8ed | 2026-09-04 13:55:06
// Labels cartao_debito e cartao_credito, mantendo cartao como fallback legado
// Quadros informativos do Livro de Vendas -- "Em caixa" (vendas já
// pagas, com detalhamento por forma de pagamento logo abaixo) e "Em
// aberto" (vendas em vale ainda não pagas), ambos filtrados pelo
// período do escopo ativo do menu interativo.
import { Card, CardContent } from "@/components/ui/card"

const LABEL_FORMA_PAGAMENTO: Record<string, string> = {
  cartao_debito: "Cartão Débito",
  cartao_credito: "Cartão Crédito",
  cartao: "Cartão",  // legado -- registros anteriores à migration m8n9o0p1q2r3
  pix: "Pix",
  dinheiro: "Dinheiro",
  vale: "Vale",
}

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
    <div className="flex items-center gap-4">
      <p className="sr-only">{titulo}</p>
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
  )
}

interface FormaPagamentoValor {
  forma_pagamento: string
  valor: string | number
}

interface LivroVendasCardsProps {
  emCaixaQtd: number
  emCaixaValor: string | number
  emCaixaPorFormaPagamento: FormaPagamentoValor[]
  emAbertoQtd: number
  emAbertoValor: string | number
  isLoading?: boolean
}

export function LivroVendasCards({
  emCaixaQtd,
  emCaixaValor,
  emCaixaPorFormaPagamento,
  emAbertoQtd,
  emAbertoValor,
  isLoading,
}: LivroVendasCardsProps) {
  if (isLoading) {
    return (
      <div className="flex flex-wrap gap-4">
        <div className="h-48 flex-1 min-w-[220px] animate-pulse rounded-xl border bg-muted/40" />
        <div className="h-48 flex-1 min-w-[220px] animate-pulse rounded-xl border bg-muted/40" />
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-stretch gap-4">
      <Card className="flex-1 min-w-[220px]">
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">
            Em caixa
          </p>
          <ResumoCard titulo="Em caixa" qtd={emCaixaQtd} valor={emCaixaValor} />

          <div className="flex flex-col gap-1 border-t pt-3">
            {emCaixaPorFormaPagamento.map((item) => (
              <div
                key={item.forma_pagamento}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-muted-foreground">
                  {LABEL_FORMA_PAGAMENTO[item.forma_pagamento] ??
                    item.forma_pagamento}
                </span>
                <span className="font-medium">{formatMoney(item.valor)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="flex-1 min-w-[220px]">
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">
            Em aberto
          </p>
          <ResumoCard
            titulo="Em aberto"
            qtd={emAbertoQtd}
            valor={emAbertoValor}
            destaque="aberto"
          />
        </CardContent>
      </Card>
    </div>
  )
}

export default LivroVendasCards
