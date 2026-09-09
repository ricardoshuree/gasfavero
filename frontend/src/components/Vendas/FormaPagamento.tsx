// [mcp-local harness] feature: vendas_ajustes_cosmeticos | plano: 14031785 | 2026-09-09 14:19:23
// FormaPagamento simplificado: só grade de botões; campos extras movidos para coluna direita em vendas.tsx
import { Banknote, CreditCard, Flame, QrCode, Receipt, Truck } from "lucide-react"
import { cn } from "@/lib/utils"

export type FormaPagamentoValue =
  | "cartao_debito"
  | "cartao_credito"
  | "pix"
  | "dinheiro"
  | "vale"
  | "vale_gas"
  | "gas_povo"

const OPCOES: {
  value: FormaPagamentoValue
  label: string
  icon: typeof CreditCard
}[] = [
  { value: "cartao_debito",  label: "Débito",      icon: CreditCard },
  { value: "cartao_credito", label: "Crédito",     icon: CreditCard },
  { value: "pix",            label: "Pix",         icon: QrCode },
  { value: "dinheiro",       label: "Dinheiro",    icon: Banknote },
  { value: "vale",           label: "Fiado",       icon: Receipt },
  { value: "vale_gas",       label: "Vale Gás",    icon: Flame },
  { value: "gas_povo",       label: "Gás do Povo", icon: Truck },
]

interface FormaPagamentoProps {
  value: FormaPagamentoValue | null
  onChange: (value: FormaPagamentoValue) => void
}

// Componente simplificado: só renderiza a grade de botões.
// Os campos extras (Fiado, Vale Gás, Gás do Povo) são renderizados
// diretamente em vendas.tsx na coluna direita, acima de Pago+Data.
export function FormaPagamento({ value, onChange }: FormaPagamentoProps) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">Forma de Pagamento</p>
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
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
              <span className="font-semibold text-xs text-center leading-tight">{opcao.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default FormaPagamento
