// [mcp-local harness] feature: vale-data-checkbox | plano: 09ddcd30 | 2026-09-04 14:15:50
// Checkbox 5º dia útil do mês seguinte substitui o texto explicativo — marcado oculta o campo de data, desmarcado mostra para edição manual
import { useState } from "react"
import { Banknote, CreditCard, QrCode, Receipt } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export type FormaPagamentoValue =
  | "cartao_debito"
  | "cartao_credito"
  | "pix"
  | "dinheiro"
  | "vale"

const OPCOES: {
  value: FormaPagamentoValue
  label: string
  icon: typeof CreditCard
}[] = [
  { value: "cartao_debito", label: "Débito", icon: CreditCard },
  { value: "cartao_credito", label: "Crédito", icon: CreditCard },
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
  // Marcado por padrão: o comportamento mais comum é usar o 5º dia útil.
  // Quando o usuário desmarca, o campo de data aparece para edição manual.
  // Quando marcado, a data é limpa — o backend calcula automaticamente.
  const [quintoUtil, setQuintoUtil] = useState(true)

  const handleQuintoUtilChange = (checked: boolean) => {
    setQuintoUtil(checked)
    if (checked) {
      // Limpa a data para o backend calcular o 5º dia útil
      onDataPagamentoValeChange("")
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">Forma de Pagamento</p>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
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
              <span className="font-semibold text-xs">{opcao.label}</span>
            </button>
          )
        })}
      </div>

      {value === "vale" && (
        <div className="flex flex-col gap-4 rounded-lg border p-3">
          <div className="grid grid-cols-2 gap-4">
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

            {!quintoUtil && (
              <div className="grid gap-1.5">
                <Label htmlFor="data-pagamento-vale">Data a ser pago</Label>
                <Input
                  id="data-pagamento-vale"
                  type="date"
                  value={dataPagamentoVale}
                  onChange={(e) => onDataPagamentoValeChange(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="quinto-util"
              checked={quintoUtil}
              onCheckedChange={(checked) =>
                handleQuintoUtilChange(checked === true)
              }
            />
            <label
              htmlFor="quinto-util"
              className="text-sm text-muted-foreground cursor-pointer select-none"
            >
              5º dia útil do mês seguinte
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

export default FormaPagamento
