// [mcp-local harness] feature: ajustes-endereco-card-mes-data-vale | plano: 15362128 | 2026-08-05 21:55:10
// Adiciona o 4o card 'Vales pagos: Mes Ano' ao dashboard de Recebimento de Vale
// [mcp-local harness] feature: ajustes-endereco-card-mes-data-vale | plano: 15362128
// Card novo: "Vales pagos: {Mes Ano}" (soma pagos_mes_qtd/valor do resumo)
//
// Cards do topo da tela /recebimento-vale: em aberto, em atraso,
// pago aguardando baixa, e vales pagos no mes vigente. O terceiro tem
// um botao que troca o filtro da tabela abaixo pra "aguardando_baixa"
// (repassado via onVerPagos).
import { useQuery } from "@tanstack/react-query"

import { VendasService } from "@/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

function formatMoney(valor: string | number): string {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
]

function mesVigenteLabel(): string {
  const agora = new Date()
  return `${MESES[agora.getMonth()]} ${agora.getFullYear()}`
}

interface ResumoCardProps {
  titulo: string
  qtd: number
  valor: string
  destaque?: "atraso"
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
              (destaque === "atraso"
                ? "border-destructive text-destructive"
                : "")
            }
          >
            {qtd}
          </div>
          <div className="flex flex-col">
            <span
              className={
                "text-lg font-semibold " +
                (destaque === "atraso" ? "text-destructive" : "")
              }
            >
              {formatMoney(valor)}
            </span>
            <span className="text-xs text-muted-foreground">
              {qtd === 1 ? "vale" : "vales"}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface ResumoCardsProps {
  onVerPagos: () => void
}

export function ResumoCards({ onVerPagos }: ResumoCardsProps) {
  const { data } = useQuery({
    queryKey: ["recebimentoValeResumo"],
    queryFn: () => VendasService.readResumoRecebimentoVale(),
  })

  if (!data) {
    return (
      <div className="flex flex-wrap gap-4">
        <div className="h-32 flex-1 min-w-[220px] animate-pulse rounded-xl border bg-muted/40" />
        <div className="h-32 flex-1 min-w-[220px] animate-pulse rounded-xl border bg-muted/40" />
        <div className="h-32 flex-1 min-w-[220px] animate-pulse rounded-xl border bg-muted/40" />
        <div className="h-32 flex-1 min-w-[220px] animate-pulse rounded-xl border bg-muted/40" />
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-stretch gap-4">
      <ResumoCard
        titulo="Vales em aberto"
        qtd={data.em_aberto_qtd}
        valor={data.em_aberto_valor}
      />
      <ResumoCard
        titulo="Em atraso (mais de 30 dias)"
        qtd={data.atraso_qtd}
        valor={data.atraso_valor}
        destaque="atraso"
      />
      <div className="flex flex-1 min-w-[220px] flex-col gap-2">
        <ResumoCard
          titulo="Pago aguardando baixa"
          qtd={data.aguardando_baixa_qtd}
          valor={data.aguardando_baixa_valor}
        />
        <Button
          className="w-full bg-sky-700 text-white hover:bg-sky-800"
          onClick={onVerPagos}
        >
          Pagos
        </Button>
      </div>
      <ResumoCard
        titulo={`Vales pagos: ${mesVigenteLabel()}`}
        qtd={data.pagos_mes_qtd}
        valor={data.pagos_mes_valor}
      />
    </div>
  )
}

export default ResumoCards
