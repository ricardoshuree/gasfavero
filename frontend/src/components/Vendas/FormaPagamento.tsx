// [mcp-local harness] feature: gas-povo | plano: 9b775808 | 2026-09-06 00:10:05
// Adiciona botao Gas do Povo com campos Valor Gov e Frete; grid 4-col/7-col para acomodar 7 opcoes
import { useEffect, useState } from "react"
import { Banknote, CreditCard, Flame, QrCode, Receipt, Truck } from "lucide-react"

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
  | "gas_povo"

const OPCOES: {
  value: FormaPagamentoValue
  label: string
  icon: typeof CreditCard
}[] = [
  { value: "cartao_debito",  label: "Débito",    icon: CreditCard },
  { value: "cartao_credito", label: "Crédito",   icon: CreditCard },
  { value: "pix",            label: "Pix",       icon: QrCode },
  { value: "dinheiro",       label: "Dinheiro",  icon: Banknote },
  { value: "vale",           label: "Fiado",     icon: Receipt },
  { value: "vale_gas",       label: "Vale Gás",  icon: Flame },
  { value: "gas_povo",       label: "Gás do Povo", icon: Truck },
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
  // Gas do Povo
  gasPovoValorGov: string
  onGasPovoValorGovChange: (value: string) => void
  gasPovoFrete: string
  onGasPovoFreteChange: (value: string) => void
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
  gasPovoValorGov,
  onGasPovoValorGovChange,
  gasPovoFrete,
  onGasPovoFreteChange,
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

  // Total Gas do Povo = valor gov + frete
  const gasPovoTotal =
    (parseFloat(gasPovoValorGov) || 0) + (parseFloat(gasPovoFrete) || 0)

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

      {/* Gas do Povo */}
      {value === "gas_povo" && (
        <div className="flex flex-col gap-3 rounded-lg border p-3">
          <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2">
            <p className="text-xs text-blue-800">
              Programa governamental — o governo paga depois. O frete é cobrado do cliente no ato.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="gas-povo-valor-gov">Valor do governo (R$)</Label>
              <Input
                id="gas-povo-valor-gov"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={gasPovoValorGov}
                onChange={(e) => onGasPovoValorGovChange(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="gas-povo-frete">Frete do cliente (R$)</Label>
              <Input
                id="gas-povo-frete"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={gasPovoFrete}
                onChange={(e) => onGasPovoFreteChange(e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>
          {gasPovoTotal > 0 && (
            <div className="flex justify-between items-center rounded-md bg-muted px-3 py-2">
              <span className="text-xs text-muted-foreground">Total a receber</span>
              <span className="text-sm font-semibold">
                R$ {gasPovoTotal.toFixed(2).replace(".", ",")}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default FormaPagamento
