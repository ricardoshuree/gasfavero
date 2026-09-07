// [mcp-local harness] feature: emprestimo_casco | plano: ed5b9c43 | 2026-09-07 15:49:33
// Adiciona prop cascos e bloco âmbar de empréstimo de casco no ResumoVendaDialog
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
  cartao_debito: "Cartão Débito",
  cartao_credito: "Cartão Crédito",
  pix: "Pix",
  dinheiro: "Dinheiro",
  vale: "Fiado",
  vale_gas: "Vale Gás",
  gas_povo: "Gás do Povo",
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
  valeNumero,
  dataPagamentoVale,
  valorPago,
  dataVenda,
  isPending,
  onConfirm,
}: ResumoVendaDialogProps) {
  const total = itens.reduce(
    (acc, item) => acc + Number(item.precoUnitario) * item.quantidade,
    0,
  )

  // Mapa produtoId -> title para exibir nome no resumo de cascos
  const tituloPorProduto = Object.fromEntries(itens.map((i) => [i.produtoId, i.title]))
  const totalCascos = cascos.reduce((acc, c) => acc + c.quantidade, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar Venda</DialogTitle>
          <DialogDescription>
            Confira os dados antes de finalizar -- depois de confirmado não dá
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

          <div className="rounded-md border p-2">
            {itens.map((item) => (
              <div key={item.produtoId} className="flex justify-between">
                <span>{item.quantidade}x {item.title}</span>
                <span>{formatMoney(Number(item.precoUnitario) * item.quantidade)}</span>
              </div>
            ))}
            <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
              <span>Total</span>
              <span>{formatMoney(total)}</span>
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

          <div>
            <p className="text-muted-foreground">Pagamento</p>
            <p className="font-medium">
              {LABEL_PAGAMENTO[formaPagamento] ?? formaPagamento}
              {formaPagamento === "vale" && valeNumero
                ? ` — vale nº ${valeNumero} (previsão ${dataPagamentoVale || "5º dia útil do mês seguinte"})`
                : ""}
            </p>
            <p className="text-muted-foreground">
              Pago: {formatMoney(Number(valorPago) || 0)} · Data: {dataVenda}
            </p>
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
