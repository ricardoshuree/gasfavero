// [mcp-local harness] feature: fluxo-vendas-distribuidora-frontend | plano: b8adcd52 | 2026-08-05 10:40:37
// Botoes quadrados de forma de pagamento + campos de vale condicionais
import { Banknote, CreditCard, QrCode, Receipt } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export type FormaPagamentoValue = "cartao" | "pix" | "dinheiro" | "vale"

const OPCOES: {
  value: FormaPagamentoValue
  label: string
  icon: typeof CreditCard
}[] = [
  { value: "cartao", label: "Cartão", icon: CreditCard },
  { value: "pix", label: "Pix", icon: QrCode },
  { value: "dinheiro", label: "Dinheiro", icon: Banknote },
  { value: "vale", label: "Vale", icon: Receipt },
]

interface FormaPagamentoProps {
  value: FormaPagamentoValue | null
  onChange: (value: FormaPagamentoValue) => void
  valeNumero: string
  onValeNumeroChange: (value: string) => void
  dataPagamentoVale: string
  onDataPagamentoValeChange: (value: string) => void
}

export function FormaPagamento({
  value,
  onChange,
  valeNumero,
  onValeNumeroChange,
  dataPagamentoVale,
  onDataPagamentoValeChange,
}: FormaPagamentoProps) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">Forma de Pagamento</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {OPCOES.map((opcao) => {
          const Icon = opcao.icon
          const selecionado = value === opcao.value
          return (
            <button
              key={opcao.value}
              type="button"
              onClick={() => onChange(opcao.value)}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-xl border-2 py-6 transition-all",
                selecionado
                  ? "border-primary bg-primary/20 translate-y-0.5 shadow-inner"
                  : "border-border bg-card hover:border-primary/50",
              )}
            >
              <Icon className="h-6 w-6" />
              <span className="font-semibold">{opcao.label}</span>
            </button>
          )
        })}
      </div>

      {value === "vale" && (
        <div className="grid grid-cols-2 gap-4 rounded-lg border p-3">
          <div className="grid gap-1.5">
            <Label htmlFor="vale-numero">Número do vale</Label>
            <Input
              id="vale-numero"
              type="number"
              inputMode="numeric"
              value={valeNumero}
              onChange={(e) => onValeNumeroChange(e.target.value)}
              placeholder="Ex: 123"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="data-pagamento-vale">Data a ser pago</Label>
            <Input
              id="data-pagamento-vale"
              type="date"
              value={dataPagamentoVale}
              onChange={(e) => onDataPagamentoValeChange(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Se deixar em branco, calcula o 5º dia útil do mês seguinte
              automaticamente.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default FormaPagamento
