// [mcp-local harness] feature: multiplas_formas_pagamento_ui | plano: 47ac2e3b | 2026-09-09 15:51:29
// Multi-seleção: value vira string[], Vale Gás e Gás do Povo são exclusivos
// Múltipla seleção de formas de pagamento.
// Vale Gás e Gás do Povo são exclusivos (substituem tudo ao clicar).
// Clique numa forma ativa adiciona; segundo clique remove.
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

export const FORMAS_EXCLUSIVAS: FormaPagamentoValue[] = ["vale_gas", "gas_povo"]

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
  value: FormaPagamentoValue[]
  onChange: (value: FormaPagamentoValue[]) => void
}

export function FormaPagamento({ value, onChange }: FormaPagamentoProps) {
  const handleClick = (forma: FormaPagamentoValue) => {
    const jaAtivo = value.includes(forma)
    const exclusivo = FORMAS_EXCLUSIVAS.includes(forma)

    if (jaAtivo) {
      // remove — mas não deixa array vazio se for a única
      const novo = value.filter((f) => f !== forma)
      onChange(novo)
      return
    }

    if (exclusivo) {
      // exclusivo substitui tudo
      onChange([forma])
      return
    }

    // remove exclusivos que possam estar ativos e adiciona a nova forma
    const semExclusivos = value.filter((f) => !FORMAS_EXCLUSIVAS.includes(f))
    onChange([...semExclusivos, forma])
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">Forma de Pagamento</p>
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
        {OPCOES.map((opcao) => {
          const Icon = opcao.icon
          const selecionado = value.includes(opcao.value)
          return (
            <button
              key={opcao.value}
              type="button"
              onClick={() => handleClick(opcao.value)}
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
