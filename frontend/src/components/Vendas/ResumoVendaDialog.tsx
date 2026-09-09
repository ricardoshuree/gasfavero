// [mcp-local harness] feature: sacola_reset_e_resumo_valor_pago | plano: 22053e73 | 2026-09-09 17:09:42
// Valor pago em linha própria com cor âmbar quando desconto; total inclui cascos comprados; lista formas no mix
// Valor pago exibido em linha própria com cor âmbar quando < total da sacola.
// Total inclui cascos comprados na venda.
import { Package } from "lucide-react"

import type { EnderecoPublic } from "@/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LoadingButton } from "@/components/ui/loading-button"
import type { CascoItem } from "./PainelCasco"
import type { SacolaItem } from "./Sacola"

function formatMoney(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

const LABEL_PAGAMENTO: Record<string, string> = {
  cartao_debito:  "Cartão Débito",
  cartao_credito: "Cartão Crédito",
  pix:            "Pix",
  dinheiro:       "Dinheiro",
  vale:           "Fiado",
  vale_gas:       "Vale Gás",
  gas_povo:       "Gás do Povo",
}

interface ResumoVendaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clienteNome: string
  endereco: EnderecoPublic | null
  motoristaNome: string
  itens: SacolaItem[]
  cascos?: CascoItem[]
  formaPagamento: string
  formasPagamento?: string[]        // lista completa para mix
  valeNumero: string
  dataPagamentoVale: string
  valorPago: string
  dataVenda: string
  isPending: boolean
  onConfirm: () => void
}

export function ResumoVendaDialog({
  open,
  onOpenChange,
  clienteNome,
  endereco,
  motoristaNome,
  itens,
  cascos = [],
  formaPagamento,
  formasPagamento = [],
  valeNumero,
  dataPagamentoVale,
  valorPago,
  dataVenda,
  isPending,
  onConfirm,
}: ResumoVendaDialogProps) {
  // Total da sacola inclui gás + cascos comprados (com_casco=true)
  const totalItens = itens.reduce((acc, item) => {
    const gas = Number(item.precoUnitario) * item.quantidade
    const casco = item.comCasco && item.precoCascoAtual
      ? Number(item.precoCascoAtual) * item.quantidade
      : 0
    return acc + gas + casco
  }, 0)

  const valorPagoNum = Number(valorPago) || 0
  const desconto = valorPagoNum < totalItens

  const tituloPorProduto = Object.fromEntries(itens.map((i) => [i.produtoId, i.title]))
  const totalCascos = cascos.reduce((acc, c) => acc + c.quantidade, 0)

  // Label da forma de pagamento: usa lista completa se houver mix
  const formas = formasPagamento.length > 0 ? formasPagamento : [formaPagamento]
  const labelFormas = formas.map((f) => LABEL_PAGAMENTO[f] ?? f).join(" + ")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar Venda</DialogTitle>
          <DialogDescription>
            Confira os dados antes de finalizar — depois de confirmado não dá
            pra editar, só estornar/ajustar manualmente.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Cliente</p>
            <p className="font-medium">{clienteNome}</p>
            {endereco && (
              <p className="text-muted-foreground">
                {endereco.rua_nome}, {endereco.numero} — {endereco.bairro_nome}
              </p>
            )}
          </div>

          <div>
            <p className="text-muted-foreground">Atribuído a</p>
            <p className="font-medium">{motoristaNome}</p>
          </div>

          {/* Itens da sacola */}
          <div className="rounded-md border p-2">
            {itens.map((item) => (
              <div key={item.produtoId} className="flex flex-col">
                <div className="flex justify-between">
                  <span>{item.quantidade}× {item.title}</span>
                  <span>{formatMoney(Number(item.precoUnitario) * item.quantidade)}</span>
                </div>
                {item.comCasco && item.precoCascoAtual && (
                  <div className="flex justify-between pl-4 text-xs text-muted-foreground">
                    <span>+ casco</span>
                    <span>{formatMoney(Number(item.precoCascoAtual) * item.quantidade)}</span>
                  </div>
                )}
              </div>
            ))}
            <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
              <span>Total</span>
              <span>{formatMoney(totalItens)}</span>
            </div>
          </div>

          {/* Cascos emprestados */}
          {totalCascos > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2 dark:border-amber-700 dark:bg-amber-950/30">
              <div className="mb-1.5 flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                  ⚠️ Empréstimo de casco — {totalCascos} unidade{totalCascos !== 1 ? "s" : ""}
                </p>
              </div>
              {cascos.map((c) => (
                <div key={c.produto_id} className="flex justify-between text-xs text-amber-700 dark:text-amber-300">
                  <span>{tituloPorProduto[c.produto_id] ?? c.produto_id}</span>
                  <span>{c.quantidade} casco{c.quantidade !== 1 ? "s" : ""}</span>
                </div>
              ))}
            </div>
          )}

          {/* Pagamento */}
          <div>
            <p className="text-muted-foreground">Pagamento</p>
            <p className="font-medium">
              {labelFormas}
              {formas.includes("vale") && valeNumero
                ? ` — vale nº ${valeNumero} (previsão ${dataPagamentoVale || "5º dia útil do mês seguinte"})`
                : ""}
            </p>
            <p className="text-muted-foreground text-xs">Data: {dataVenda}</p>

            {/* Valor pago — âmbar quando há desconto */}
            <div className="mt-1 flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm text-muted-foreground">Valor pago</span>
              <span className={`text-sm font-semibold ${desconto ? "text-amber-500" : "text-[#00a63e]"}`}>
                {formatMoney(valorPagoNum)}
              </span>
            </div>

            {/* Aviso de desconto */}
            {desconto && (
              <p className="mt-1 text-xs text-amber-500">
                ⚠️ Desconto de {formatMoney(totalItens - valorPagoNum)} aplicado
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Voltar
          </Button>
          <LoadingButton onClick={onConfirm} loading={isPending}>
            Confirmar Venda
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ResumoVendaDialog
