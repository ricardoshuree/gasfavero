// [mcp-local harness] feature: recebimento_fiado_conta_corrente | plano: 58a35598 | 2026-09-10 13:02:25
// ReciboPanel: extrato imprimível com folhas em aberto, pagamentos recentes e saldo devedor
// ReciboPanel: coluna da direita — extrato imprimível do cliente.
// Aparece ao clicar em "Extrato" ou automaticamente após quitação total.
// Botão "Imprimir" usa window.print() — CSS @media print oculta o resto da página.
import { Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { VendaPublic } from "@/client"

interface Props {
  clienteNome: string
  clienteCpf: string
  vendas: VendaPublic[]
}

function fmt(v: number | string): string {
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function hoje(): string {
  return new Date().toLocaleDateString("pt-BR")
}

export function ReciboPanel({ clienteNome, clienteCpf, vendas }: Props) {
  const abertas = vendas
    .filter((v) => v.forma_pagamento === "vale" && !v.pago_em && v.status !== "cancelada")
    .sort((a, b) => new Date(a.data_venda).getTime() - new Date(b.data_venda).getTime())

  const pagas = vendas
    .filter((v) => v.forma_pagamento === "vale" && !!v.pago_em && v.status !== "cancelada")
    .sort((a, b) => new Date(b.pago_em!).getTime() - new Date(a.pago_em!).getTime())
    .slice(0, 5)

  const saldoTotal = abertas.reduce((s, v) => s + Number(v.valor_total) - Number(v.valor_pago), 0)
  const totalRecebido = pagas.reduce((s, v) => s + Number(v.valor_pago), 0)

  return (
    <div className="flex flex-col rounded-xl border bg-card overflow-hidden print:shadow-none" id="recibo-print">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Printer className="h-4 w-4 text-muted-foreground" />
          Extrato do cliente
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs print:hidden"
          onClick={() => window.print()}
        >
          <Printer className="h-3.5 w-3.5 mr-1" />
          Imprimir
        </Button>
      </div>

      {/* Corpo */}
      <div className="px-4 py-3 flex flex-col gap-4">
        {/* Identificação */}
        <div>
          <p className="text-sm font-medium">{clienteNome}</p>
          <p className="text-xs text-muted-foreground">CPF: {clienteCpf}</p>
          <p className="text-xs text-muted-foreground">Emitido em {hoje()}</p>
        </div>

        {/* Folhas em aberto */}
        {abertas.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
              Folhas em aberto
            </p>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1 text-muted-foreground font-medium">Folha</th>
                  <th className="text-left py-1 text-muted-foreground font-medium">Vencto</th>
                  <th className="text-right py-1 text-muted-foreground font-medium">Valor</th>
                  <th className="text-right py-1 text-muted-foreground font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {abertas.map((v) => {
                  const saldo = Number(v.valor_total) - Number(v.valor_pago)
                  return (
                    <tr key={v.id} className="border-b last:border-0">
                      <td className="py-1.5">nº {v.vale_numero ?? "—"}</td>
                      <td className="py-1.5 text-muted-foreground">{v.data_pagamento_vale ?? "—"}</td>
                      <td className="py-1.5 text-right">{fmt(v.valor_total)}</td>
                      <td className={`py-1.5 text-right font-medium ${saldo > 0 ? "text-destructive" : "text-[#00a63e]"}`}>
                        {fmt(saldo)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagamentos recentes */}
        {pagas.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
              Pagamentos recebidos
            </p>
            <table className="w-full text-xs border-collapse">
              <tbody>
                {pagas.map((v) => (
                  <tr key={v.id} className="border-b last:border-0">
                    <td className="py-1.5">nº {v.vale_numero ?? "—"} quitado</td>
                    <td className="py-1.5 text-muted-foreground">
                      {v.pago_em ? new Date(v.pago_em).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="py-1.5 text-right font-medium text-[#00a63e]">
                      + {fmt(v.valor_pago)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totais */}
        <div className="border-t pt-3 flex flex-col gap-1">
          {totalRecebido > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Total recebido (recentes)</span>
              <span className="font-medium text-[#00a63e]">{fmt(totalRecebido)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-medium">
            <span>Saldo devedor</span>
            <span className={saldoTotal > 0 ? "text-destructive" : "text-[#00a63e]"}>
              {fmt(saldoTotal)}
            </span>
          </div>
        </div>

        {/* Rodapé */}
        <p className="text-center text-xs text-muted-foreground border-t pt-3">
          Distribuidora Gás Favero · Veranópolis/RS · {hoje()}
        </p>
      </div>
    </div>
  )
}

export default ReciboPanel
