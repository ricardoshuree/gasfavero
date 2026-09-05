// [mcp-local harness] feature: fix-complemento-e-trava-pago | plano: d4d7e0ba | 2026-08-05 22:18:36
// Trava valor pago e botao Pago apos marcar (so pode marcar uma vez); campo desabilitado mantendo os registros atuais
// Painel (Sheet) da tela /recebimento-vale. Fluxo:
//   1) campo "valor pago" editavel (pre-preenchido com o ja registrado)
//   2) botao "Pago" (verde) -> marcar-pago -- registra o recebimento,
//      NAO fecha a venda, so libera o botao de baixa. Uma vez marcado,
//      tanto o campo "valor pago" quanto o botao "Pago" ficam travados
//      (so pode marcar como pago uma unica vez -- pra corrigir o valor
//      seria preciso a distribuidora dar baixa e o motorista/operador
//      relancar, nao editar o registro ja feito)
//   3) botao "Baixa do fiado" (azul) -> abre um Dialog de confirmacao
//      -- ao confirmar, chama baixar-vale, que SEMPRE fecha a venda
//      (pago_em), nao importa o valor. Se o valor for menor que o
//      total, a diferenca e tratada como desconto -- nunca deixa a
//      venda em aberto de novo (decisao do Ricardo).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import { VendasService } from "@/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingButton } from "@/components/ui/loading-button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

function formatMoney(valor: string | number): string {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

function formatDate(iso: string): string {
  const [ano, mes, dia] = iso.split("-")
  return `${dia}/${mes}/${ano}`
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR")
}

interface DetalheValeSheetProps {
  vendaId: string | null
  onOpenChange: (open: boolean) => void
}

export function DetalheValeSheet({
  vendaId,
  onOpenChange,
}: DetalheValeSheetProps) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [valorPago, setValorPago] = useState("")
  const [confirmBaixaOpen, setConfirmBaixaOpen] = useState(false)

  const { data: venda } = useQuery({
    queryKey: ["venda", vendaId],
    queryFn: () => VendasService.readVenda({ id: vendaId as string }),
    enabled: !!vendaId,
  })

  // Repopula o campo sempre que abre um vale diferente (ou os dados
  // chegam depois de aberto o sheet)
  useEffect(() => {
    if (venda) {
      setValorPago(String(venda.valor_pago))
    }
  }, [venda])

  function invalidarListas() {
    queryClient.invalidateQueries({ queryKey: ["valesRecebimento"] })
    queryClient.invalidateQueries({ queryKey: ["recebimentoValeResumo"] })
  }

  const marcarPagoMutation = useMutation({
    mutationFn: () =>
      VendasService.marcarVendaPago({
        id: vendaId as string,
        requestBody: { valor_pago: valorPago },
      }),
    onSuccess: (atualizada) => {
      queryClient.setQueryData(["venda", vendaId], atualizada)
      invalidarListas()
      showSuccessToast("Pagamento registrado -- pronto pra dar baixa")
    },
    onError: handleError.bind(showErrorToast),
  })

  const baixarValeMutation = useMutation({
    mutationFn: () =>
      VendasService.baixarVale({
        id: vendaId as string,
        requestBody: { valor_pago: valorPago },
      }),
    onSuccess: () => {
      invalidarListas()
      setConfirmBaixaOpen(false)
      showSuccessToast("Fiado baixado -- venda encerrada")
      onOpenChange(false)
    },
    onError: handleError.bind(showErrorToast),
  })

  if (!venda) {
    return (
      <Sheet open={!!vendaId} onOpenChange={onOpenChange}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Carregando...</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    )
  }

  const diferenca = Number(venda.valor_total) - Number(venda.valor_pago)
  const jaMarcadoPago = venda.recebido_em != null
  const podeBaixar = jaMarcadoPago
  const baixaEhTotal = Number(valorPago) >= Number(venda.valor_total)

  return (
    <>
      <Sheet open={!!vendaId} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Fiado nº {venda.vale_numero ?? "—"}</SheetTitle>
            <SheetDescription>
              {venda.cliente_nome} · Venda em {formatDate(venda.data_venda)}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-4 text-sm">
            {venda.endereco && (
              <div>
                <p className="text-muted-foreground">Endereço</p>
                <p className="font-medium">
                  {venda.endereco.rua_nome}, {venda.endereco.numero} —{" "}
                  {venda.endereco.bairro_nome}
                </p>
              </div>
            )}

            <div className="rounded-md border p-2">
              <p className="mb-1 text-muted-foreground">Itens</p>
              {venda.itens?.map((item) => (
                <div key={item.id} className="flex justify-between">
                  <span>
                    {item.quantidade}x {item.produto_title}
                  </span>
                  <span>{formatMoney(item.subtotal)}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
                <span>Total</span>
                <span>{formatMoney(venda.valor_total)}</span>
              </div>
            </div>

            {diferenca > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Diferença (desconto se a baixa for menor)</span>
                <span className="font-medium text-foreground">
                  {formatMoney(diferenca)}
                </span>
              </div>
            )}

            {venda.recebido_em && (
              <p className="text-muted-foreground">
                Marcado como pago em {formatDateTime(venda.recebido_em)}
                {venda.recebido_por_nome
                  ? ` por ${venda.recebido_por_nome}`
                  : ""}
              </p>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="valor-pago">Valor pago</Label>
              <Input
                id="valor-pago"
                type="number"
                step="0.01"
                min="0"
                value={valorPago}
                onChange={(e) => setValorPago(e.target.value)}
                disabled={jaMarcadoPago || baixarValeMutation.isPending}
              />
            </div>

            <div className="flex flex-col gap-2">
              <LoadingButton
                className="bg-green-600 text-white hover:bg-green-700"
                loading={marcarPagoMutation.isPending}
                disabled={jaMarcadoPago}
                onClick={() => marcarPagoMutation.mutate()}
              >
                Pago
              </LoadingButton>
              <LoadingButton
                className="bg-blue-600 text-white hover:bg-blue-700"
                disabled={!podeBaixar}
                onClick={() => setConfirmBaixaOpen(true)}
              >
                Baixa do fiado
              </LoadingButton>
              {!podeBaixar && (
                <p className="text-xs text-muted-foreground">
                  Marque como "Pago" antes de dar a baixa.
                </p>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={confirmBaixaOpen} onOpenChange={setConfirmBaixaOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar baixa</DialogTitle>
            <DialogDescription>
              {baixaEhTotal
                ? `Confirma a baixa de ${formatMoney(valorPago)} para este fiado? Essa ação encerra a venda e não pode ser desfeita.`
                : `Confirma a baixa de ${formatMoney(valorPago)} para este fiado? A diferença de ${formatMoney(Number(venda.valor_total) - Number(valorPago))} será tratada como desconto -- a venda será encerrada e não ficará mais pendente de recebimento.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={baixarValeMutation.isPending}
              onClick={() => setConfirmBaixaOpen(false)}
            >
              Cancelar
            </Button>
            <LoadingButton
              className="bg-blue-600 text-white hover:bg-blue-700"
              loading={baixarValeMutation.isPending}
              onClick={() => baixarValeMutation.mutate()}
            >
              Confirmar baixa
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default DetalheValeSheet
