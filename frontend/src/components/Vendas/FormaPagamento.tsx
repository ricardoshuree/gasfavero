// [mcp-local harness] feature: venda-vale-gas | plano: 9a811f03 | 2026-09-05 21:35:31
// Adiciona botao Vale Gas com campo de numero e validacao em tempo real do estabelecimento associado
// Checkbox 5o dia util do mes seguinte substitui o texto explicativo
// Vale Gas: campo de numero com validacao em tempo real do estabelecimento
import { useEffect, useState } from "react"
import { Banknote, CreditCard, Flame, QrCode, Receipt } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"

export type FormaPagamentoValue =
  | "cartao_debito"
  | "cartao_credito"
  | "pix"
  | "dinheiro"
  | "vale"
  | "vale_gas"

const OPCOES: {
  value: FormaPagamentoValue
  label: string
  icon: typeof CreditCard
}[] = [
  { value: "cartao_debito", label: "Débito",    icon: CreditCard },
  { value: "cartao_credito", label: "Crédito",  icon: CreditCard },
  { value: "pix",            label: "Pix",      icon: QrCode },
  { value: "dinheiro",       label: "Dinheiro", icon: Banknote },
  { value: "vale",           label: "Fiado",    icon: Receipt },
  { value: "vale_gas",       label: "Vale Gás", icon: Flame },
]

interface ValeGasInfo {
  valido: boolean
  estabelecimento_nome: string | null
  estabelecimento_cpf: string | null
  bloco_id: string | null
}

interface FormaPagamentoProps {
  value: FormaPagamentoValue | null
  onChange: (value: FormaPagamentoValue) => void
  // Fiado
  valeNumero: string
  onValeNumeroChange: (value: string) => void
  dataPagamentoVale: string
  onDataPagamentoValeChange: (value: string) => void
  // Vale Gas
  valeGasNumero: string
  onValeGasNumeroChange: (value: string) => void
  onValeGasBlocoIdChange: (value: string | null) => void
}

export function FormaPagamento({
  value,
  onChange,
  valeNumero,
  onValeNumeroChange,
  dataPagamentoVale,
  onDataPagamentoValeChange,
  valeGasNumero,
  onValeGasNumeroChange,
  onValeGasBlocoIdChange,
}: FormaPagamentoProps) {
  const [quintoUtil, setQuintoUtil] = useState(true)
  const [valeGasInfo, setValeGasInfo] = useState<ValeGasInfo | null>(null)
  const [validando, setValidando] = useState(false)

  const handleQuintoUtilChange = (checked: boolean) => {
    setQuintoUtil(checked)
    if (checked) onDataPagamentoValeChange("")
  }

  // Valida numero do vale gas em tempo real (debounce 600ms)
  useEffect(() => {
    if (value !== "vale_gas" || !valeGasNumero.trim()) {
      setValeGasInfo(null)
      onValeGasBlocoIdChange(null)
      return
    }
    const timer = setTimeout(async () => {
      setValidando(true)
      try {
        const token = localStorage.getItem("access_token")
        const res = await fetch(
          `${API}/api/v1/vale-gas/validar-numero/${valeGasNumero}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (!res.ok) throw new Error()
        const data: ValeGasInfo = await res.json()
        setValeGasInfo(data)
        onValeGasBlocoIdChange(data.valido ? data.bloco_id : null)
      } catch {
        setValeGasInfo(null)
        onValeGasBlocoIdChange(null)
      } finally {
        setValidando(false)
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [valeGasNumero, value])

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">Forma de Pagamento</p>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
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

      {/* Fiado */}
      {value === "vale" && (
        <div className="flex flex-col gap-4 rounded-lg border p-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="vale-numero">Número do fiado</Label>
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
              onCheckedChange={(checked) => handleQuintoUtilChange(checked === true)}
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

      {/* Vale Gas */}
      {value === "vale_gas" && (
        <div className="flex flex-col gap-3 rounded-lg border p-3">
          <div className="grid gap-1.5">
            <Label htmlFor="vale-gas-numero">Número do vale gás</Label>
            <Input
              id="vale-gas-numero"
              type="number"
              inputMode="numeric"
              value={valeGasNumero}
              onChange={(e) => onValeGasNumeroChange(e.target.value)}
              placeholder="Ex: 1001"
            />
          </div>

          {/* Feedback de validacao */}
          {validando && (
            <p className="text-xs text-muted-foreground">Verificando...</p>
          )}
          {!validando && valeGasInfo !== null && (
            valeGasInfo.valido ? (
              <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2">
                <p className="text-xs font-medium text-green-800">
                  ✓ Estabelecimento: {valeGasInfo.estabelecimento_nome}
                </p>
                <p className="text-xs text-green-700">{valeGasInfo.estabelecimento_cpf}</p>
              </div>
            ) : (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2">
                <p className="text-xs text-destructive">
                  Número não encontrado em nenhum bloco de vale gás cadastrado.
                </p>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}

export default FormaPagamento
