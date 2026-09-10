// [mcp-local harness] feature: recebimento_fiado_conta_corrente | plano: 58a35598 | 2026-09-10 13:01:14
// ResumoCards com cards bordados leves, sem Card/CardContent shadcn
// ResumoCards atualizado para o novo layout de conta-corrente.
// Cards com borda leve como no mockup — sem Card/CardContent do shadcn, HTML puro.
import { useQuery } from "@tanstack/react-query"
import { VendasService } from "@/client"

function fmt(valor: string | number): string {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"]

function mesLabel(): string {
  const d = new Date()
  return `${MESES[d.getMonth()]} ${d.getFullYear()}`
}

interface MetricCardProps {
  label: string
  valor: string | number
  cor?: "danger" | "warning" | "success" | "muted"
  loading?: boolean
}

function MetricCard({ label, valor, cor = "muted", loading }: MetricCardProps) {
  const corClass = {
    danger:  "text-destructive",
    warning: "text-amber-500",
    success: "text-[#00a63e]",
    muted:   "text-muted-foreground",
  }[cor]

  return (
    <div className="flex-1 min-w-[160px] rounded-xl border bg-card p-3">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      {loading
        ? <div className="h-7 w-24 animate-pulse rounded bg-muted/40" />
        : <p className={`text-xl font-medium ${corClass}`}>{fmt(valor)}</p>
      }
    </div>
  )
}

// onVerPagos mantido para retrocompat — não usado na nova tela mas pode ser chamado de fora
interface ResumoCardsProps {
  onVerPagos?: () => void
}

export function ResumoCards({ onVerPagos: _ }: ResumoCardsProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["recebimentoValeResumo"],
    queryFn: () => VendasService.readResumoRecebimentoVale(),
  })

  return (
    <div className="flex flex-wrap gap-3">
      <MetricCard label="Crédito na praça"      valor={data?.em_aberto_valor  ?? "0"} cor="danger"  loading={isLoading} />
      <MetricCard label="Em atraso"              valor={data?.atraso_valor     ?? "0"} cor="warning" loading={isLoading} />
      <MetricCard label={`Recebido — ${mesLabel()}`} valor={data?.pagos_mes_valor ?? "0"} cor="success" loading={isLoading} />
      <MetricCard label="Aguardando baixa"       valor={data?.aguardando_baixa_valor ?? "0"} cor="muted" loading={isLoading} />
    </div>
  )
}

export default ResumoCards
