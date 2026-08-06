// [mcp-local harness] feature: livro-vendas-fix-build-typescript | plano: 407bd393 | 2026-08-06 10:16:16
// Remove anotacao de tipo explicita do parametro do formatter do Tooltip (deixa o TS inferir do tipo Formatter do recharts)
// Gráfico de barras do Livro de Vendas -- eixo Y é o valor em caixa
// (R$), eixo X é o bucket de tempo correspondente à granularidade do
// escopo ativo (dia/semana/mês/ano, ver LivroVendasMenu). Renderiza
// também o label "Período: (dd/mm/aaaa - dd/mm/aaaa)" em fonte menor,
// como pedido.
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

function formatMoney(valor: string | number): string {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

function formatMoneyCompacto(valor: number): string {
  if (valor >= 1000) {
    return `R$ ${(valor / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`
  }
  return formatMoney(valor)
}

function formatDataBR(isoOrDate: string): string {
  if (!isoOrDate) return "--/--/----"
  const [ano, mes, dia] = isoOrDate.split("-")
  return `${dia}/${mes}/${ano}`
}

interface LivroVendasChartProps {
  grafico: Array<{ label: string; valor: string | number }>
  periodoInicio: string
  periodoFim: string
  isLoading?: boolean
}

export function LivroVendasChart({
  grafico,
  periodoInicio,
  periodoFim,
  isLoading,
}: LivroVendasChartProps) {
  const data = grafico.map((b) => ({ ...b, valor: Number(b.valor) }))

  return (
    <div className="flex flex-col gap-1 rounded-xl border p-4">
      <p className="text-xs text-muted-foreground">
        Período: ({formatDataBR(periodoInicio)} - {formatDataBR(periodoFim)})
      </p>

      <div className="h-64 w-full">
        {isLoading ? (
          <div className="h-full w-full animate-pulse rounded-lg bg-muted/40" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 16, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={(v) => formatMoneyCompacto(v)}
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={60}
              />
              <Tooltip
                formatter={(value) => formatMoney(Number(value))}
                cursor={{ fill: "var(--muted)", opacity: 0.4 }}
              />
              <Bar dataKey="valor" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

export default LivroVendasChart
