// [mcp-local harness] feature: fix_extrato_badge_mix | plano: 0ccece1b | 2026-09-10 16:27:56
// ReciboPanel: inclui folhas mix (VendaPagamento.vale), pagamentos parciais, saldo correto para mix
// ReciboPanel: extrato imprimível com folhas em aberto, pagamentos recentes e saldo devedor
// fix: inclui folhas mix (VendaPagamento.vale) e calcula saldo corretamente para mix
import { Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { VendaPublic } from "@/client"

interface Props {
  clienteNome: string
  clienteCpf: string
  vendas: VendaPublic[]
}

interface FolhaExtrato {
  id: string
  valeNumero: number | null
  vencimento: string | null
  valor: number
  saldo: number
  isMix: boolean
}

interface PagamentoExtrato {
  id: string
  valeNumero: number | null
  pagoEm: string | null
  valorPago: number
  descricao: string
}

function fmt(v: number | string): string {
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function hoje(): string {
  return new Date().toLocaleDateString("pt-BR")
}

export function ReciboPanel({ clienteNome, clienteCpf, vendas }: Props) {
  const abertas: FolhaExtrato[] = []
  const pagamentos: PagamentoExtrato[] = []

  for (const v of vendas) {
    if (v.status === "cancelada") continue

    if (v.forma_pagamento === "vale") {
      // Legado: fiado puro
      if (!v.pago_em) {
        abertas.push({
          id: v.id,
          valeNumero: v.vale_numero ?? null,
          vencimento: v.data_pagamento_vale ?? null,
          valor: Number(v.valor_total),
          saldo: Number(v.valor_total) - Number(v.valor_pago),
          isMix: false,
        })
      } else {
        pagamentos.push({
          id: v.id,
          valeNumero: v.vale_numero ?? null,
          pagoEm: v.pago_em,
          valorPago: Number(v.valor_pago),
          descricao: `nº ${v.vale_numero ?? "—"} quitado`,
        })
      }
    } else if (v.forma_pagamento === "mix") {
      // Mix: cada linha VendaPagamento.vale
      for (const p of (v.pagamentos ?? [])) {
        if (p.forma_pagamento !== "vale") continue
        const valorPago = Number(p.valor_pago ?? 0)
        const valor = Number(p.valor)
        if (!p.pago_em) {
          abertas.push({
            id: p.id,
            valeNumero: p.vale_numero ?? null,
            vencimento: p.data_pagamento_vale ?? null,
            valor,
            saldo: valor - valorPago,
            isMix: true,
          })
        }
        if (valorPago > 0) {
          pagamentos.push({
            id: p.id,
            valeNumero: p.vale_numero ?? null,
            pagoEm: p.pago_em ?? null,
            valorPago,
            descricao: p.pago_em
              ? `nº ${p.vale_numero ?? "—"} quitado (mix)`
              : `nº ${p.vale_numero ?? "—"} parcial (mix)`,
          })
        }
      }
    }
  }

  // Ordena abertas: mais antigas primeiro
  abertas.sort((a, b) => (a.vencimento ?? "").localeCompare(b.vencimento ?? ""))

  // Pagamentos: mais recentes primeiro, limita 5
  const pagamentosRecentes = pagamentos
    .sort((a, b) => new Date(b.pagoEm ?? 0).getTime() - new Date(a.pagoEm ?? 0).getTime())
    .slice(0, 8)

  const saldoTotal = abertas.reduce((s, f) => s + f.saldo, 0)
  const totalRecebido = pagamentosRecentes.reduce((s, p) => s + p.valorPago, 0)

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
                {abertas.map((f) => (
                  <tr key={f.id} className="border-b last:border-0">
                    <td className="py-1.5">
                      nº {f.valeNumero ?? "—"}
                      {f.isMix && <span className="ml-1 text-muted-foreground">(mix)</span>}
                    </td>
                    <td className="py-1.5 text-muted-foreground">{f.vencimento ?? "—"}</td>
                    <td className="py-1.5 text-right">{fmt(f.valor)}</td>
                    <td className={`py-1.5 text-right font-medium ${f.saldo > 0 ? "text-destructive" : "text-[#00a63e]"}`}>
                      {fmt(f.saldo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagamentos recebidos */}
        {pagamentosRecentes.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
              Pagamentos recebidos
            </p>
            <table className="w-full text-xs border-collapse">
              <tbody>
                {pagamentosRecentes.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-1.5">{p.descricao}</td>
                    <td className="py-1.5 text-muted-foreground">
                      {p.pagoEm ? new Date(p.pagoEm).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="py-1.5 text-right font-medium text-[#00a63e]">
                      + {fmt(p.valorPago)}
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
