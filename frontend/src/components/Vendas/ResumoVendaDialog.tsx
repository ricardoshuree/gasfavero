// [mcp-local harness] feature: fluxo-vendas-distribuidora-frontend | plano: b8adcd52 | 2026-08-05 10:41:42
// Dialog de resumo/confirmacao da venda antes de gravar

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
import type { SacolaItem } from "./Sacola"

function formatMoney(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

const LABEL_PAGAMENTO: Record<string, string> = {
  cartao: "Cartão",
  pix: "Pix",
  dinheiro: "Dinheiro",
  vale: "Vale",
}

interface ResumoVendaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clienteNome: string
  endereco: EnderecoPublic | null
  motoristaNome: string
  itens: SacolaItem[]
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
                <span>
                  {item.quantidade}x {item.title}
                </span>
                <span>
                  {formatMoney(Number(item.precoUnitario) * item.quantidade)}
                </span>
              </div>
            ))}
            <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
              <span>Total</span>
              <span>{formatMoney(total)}</span>
            </div>
          </div>

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
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
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
