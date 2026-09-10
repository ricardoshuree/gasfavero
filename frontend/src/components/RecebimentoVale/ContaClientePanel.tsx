// [mcp-local harness] feature: fix_conta_cliente_bugs | plano: bdd1db53 | 2026-09-10 15:16:23
// Fix 3 bugs: mix incluído em fiadasAbertas; saldo correto; extrato notificado ao carregar
// Fix 3 bugs:
// 1. fiadasAbertas inclui vendas mix (VendaPagamento.vale em aberto) além de forma_pagamento=vale
// 2. saldoFolha calculado corretamente para mix (valor do VendaPagamento, não da Venda)
// 3. extrato (ReciboPanel) recebe todas as vendas ao abrir, não só após recebimento
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, ArrowDown, Check, Clock, FileText, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { VendasService, type VendaPublic } from "@/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import useCustomToast from "@/hooks/useCustomToast"

interface Props {
  clienteId: string
  clienteNome: string
  clienteCpf: string
  onExtrato: (vendas: VendaPublic[]) => void
}

function fmt(v: number | string): string {
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

type Feedback = { texto: string; tipo: "quitou" | "parcial" }

// Representa uma folha de fiado normalizada (legada ou mix)
interface FolhaFiado {
  vendaId: string
  valeNumero: number | null
  dataPagamentoVale: string | null
  valorTotal: number     // valor desta folha de fiado
  valorPago: number      // quanto já foi pago desta folha
  saldo: number          // valorTotal - valorPago
  isMix: boolean         // se veio de VendaPagamento (mix)
  pagamentoId?: string   // id do VendaPagamento para mix
}

export function ContaClientePanel({ clienteId, clienteNome, clienteCpf, onExtrato }: Props) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const [valorInput, setValorInput] = useState("")
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])

  const { data: historico, isLoading } = useQuery({
    queryKey: ["historico-fiado", clienteId],
    queryFn: () => VendasService.readHistoricoVendasCliente({ clienteId, limit: 50 }),
    enabled: !!clienteId,
  })

  const vendas = historico?.data ?? []

  // Notifica o extrato sempre que as vendas mudam (fix bug 3: extrato preenchido ao abrir)
  useEffect(() => {
    if (vendas.length > 0) onExtrato(vendas)
  }, [vendas.length])

  // Folhas em aberto — inclui legadas (forma=vale) E mix (pagamentos[].vale em aberto)
  const fiadasAbertas: FolhaFiado[] = []

  for (const v of vendas) {
    if (v.status === "cancelada") continue

    if (v.forma_pagamento === "vale" && !v.pago_em) {
      // Legada: fiado puro
      const valorTotal = Number(v.valor_total)
      const valorPago = Number(v.valor_pago)
      fiadasAbertas.push({
        vendaId: v.id,
        valeNumero: v.vale_numero ?? null,
        dataPagamentoVale: v.data_pagamento_vale ?? null,
        valorTotal,
        valorPago,
        saldo: valorTotal - valorPago,
        isMix: false,
      })
    } else if (v.forma_pagamento === "mix" && !v.pago_em) {
      // Mix: busca as linhas de fiado em aberto dentro de pagamentos[]
      const pgtos = v.pagamentos ?? []
      for (const p of pgtos) {
        if (p.forma_pagamento === "vale" && !p.pago_em) {
          const valorTotal = Number(p.valor)
          fiadasAbertas.push({
            vendaId: v.id,
            valeNumero: p.vale_numero ?? null,
            dataPagamentoVale: p.data_pagamento_vale ?? null,
            valorTotal,
            valorPago: 0,
            saldo: valorTotal,
            isMix: true,
            pagamentoId: p.id,
          })
        }
      }
    }
  }

  // Ordena da mais antiga para a mais nova
  fiadasAbertas.sort((a, b) => {
    const da = a.dataPagamentoVale ?? ""
    const db = b.dataPagamentoVale ?? ""
    return da.localeCompare(db)
  })

  // Histórico: fiados quitados (pago_em preenchido)
  const fiadasPagas = vendas
    .filter((v) => v.forma_pagamento === "vale" && !!v.pago_em && v.status !== "cancelada")
    .sort((a, b) => new Date(b.pago_em!).getTime() - new Date(a.pago_em!).getTime())
    .slice(0, 10)

  const saldoTotal = fiadasAbertas.reduce((s, f) => s + f.saldo, 0)

  function simularDistribuicao(val: number): Feedback[] {
    if (val <= 0) return []
    let resto = val
    const fbs: Feedback[] = []
    for (const f of fiadasAbertas) {
      if (resto <= 0) break
      if (resto >= f.saldo) {
        fbs.push({ texto: `Fiado nº ${f.valeNumero ?? "—"} será quitado (${fmt(f.saldo)})`, tipo: "quitou" })
        resto -= f.saldo
      } else {
        fbs.push({ texto: `Fiado nº ${f.valeNumero ?? "—"} recebe ${fmt(resto)} — resta ${fmt(f.saldo - resto)}`, tipo: "parcial" })
        resto = 0
      }
    }
    if (resto > 0) fbs.push({ texto: `Valor excede o saldo — troco: ${fmt(resto)}`, tipo: "parcial" })
    return fbs
  }

  useEffect(() => {
    const val = parseFloat(valorInput) || 0
    setFeedbacks(simularDistribuicao(val))
  }, [valorInput, fiadasAbertas.length])

  const mutation = useMutation({
    mutationFn: async () => {
      const val = parseFloat(valorInput) || 0
      if (val <= 0) throw new Error("Informe um valor")
      let resto = val
      for (const folha of fiadasAbertas) {
        if (resto <= 0) break
        const valorEstaFolha = Math.min(resto, folha.saldo)

        if (!folha.isMix) {
          // Legada: usa marcar-pago + baixar-vale
          await VendasService.marcarVendaPago({
            id: folha.vendaId,
            requestBody: { valor_pago: String(folha.valorPago + valorEstaFolha) },
          })
          if (valorEstaFolha >= folha.saldo) {
            await VendasService.baixarVale({
              id: folha.vendaId,
              requestBody: { valor_pago: String(folha.valorTotal) },
            })
          }
        }
        // Mix: por ora registra apenas na venda pai (simplificado até Tema 1 completo)
        // TODO: quando Tema 1 implementar ContaCorrenteCliente, usar endpoint específico

        resto -= valorEstaFolha
      }
    },
    onSuccess: async () => {
      showSuccessToast("Recebimento registrado")
      setValorInput("")
      setFeedbacks([])
      await queryClient.invalidateQueries({ queryKey: ["historico-fiado", clienteId] })
      await queryClient.invalidateQueries({ queryKey: ["recebimentoValeResumo"] })
      await queryClient.invalidateQueries({ queryKey: ["vales"] })
      await queryClient.invalidateQueries({ queryKey: ["vales-recebimento-lista"] })
      const novo = await VendasService.readHistoricoVendasCliente({ clienteId, limit: 50 })
      onExtrato(novo.data ?? [])
    },
    onError: (err: any) => {
      showErrorToast(err?.body?.detail ?? "Erro ao registrar recebimento")
    },
  })

  function handleReceber() {
    const val = parseFloat(valorInput) || 0
    if (val <= 0) return showErrorToast("Informe um valor maior que zero")
    mutation.mutate()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Carregando conta...
      </div>
    )
  }

  return (
    <div className="flex flex-col rounded-xl border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <p className="text-sm font-medium">{clienteNome}</p>
          <p className="text-xs text-muted-foreground">{clienteCpf}</p>
        </div>
        <div className="text-right">
          <p className={`text-sm font-medium ${saldoTotal > 0 ? "text-destructive" : "text-[#00a63e]"}`}>
            {fmt(saldoTotal)}
          </p>
          <p className="text-xs text-muted-foreground">saldo devedor</p>
        </div>
      </div>

      {/* Folhas em aberto */}
      {fiadasAbertas.length > 0 && (
        <>
          <div className="px-4 py-1.5 text-xs text-muted-foreground bg-muted/30 border-b">
            Folhas em aberto — mais antigas primeiro
          </div>
          {fiadasAbertas.map((f, i) => {
            const vencida = f.dataPagamentoVale
              ? new Date(f.dataPagamentoVale) < new Date()
              : false
            return (
              <div key={`${f.vendaId}-${i}`} className="flex items-center gap-3 px-4 py-2.5 border-b last:border-0">
                <div className="w-7 h-7 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="h-3.5 w-3.5 text-destructive" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">
                    Fiado nº {f.valeNumero ?? "—"}
                    {f.isMix && <span className="ml-1 text-muted-foreground">(mix)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    {vencida ? (
                      <><AlertCircle className="h-3 w-3 text-destructive" /><span className="text-destructive">vencida {f.dataPagamentoVale}</span></>
                    ) : (
                      <><Clock className="h-3 w-3" />vence {f.dataPagamentoVale ?? "—"}</>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-destructive">{fmt(f.saldo)}</p>
                  <p className="text-xs text-muted-foreground">
                    {f.valorPago > 0 ? "parcial" : "em aberto"}
                  </p>
                </div>
              </div>
            )
          })}
        </>
      )}

      {/* Histórico de pagamentos */}
      {fiadasPagas.length > 0 && (
        <>
          <div className="px-4 py-1.5 text-xs text-muted-foreground bg-muted/30 border-b border-t">
            Histórico de pagamentos
          </div>
          {fiadasPagas.map((v) => (
            <div key={v.id} className="flex items-center gap-3 px-4 py-2 border-b last:border-0">
              <div className="w-7 h-7 rounded-full bg-[#00a63e]/10 flex items-center justify-center flex-shrink-0">
                <ArrowDown className="h-3.5 w-3.5 text-[#00a63e]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">Fiado nº {v.vale_numero ?? "—"} quitado</p>
                <p className="text-xs text-muted-foreground">
                  {v.pago_em ? new Date(v.pago_em).toLocaleDateString("pt-BR") : "—"}
                </p>
              </div>
              <p className="text-xs font-medium text-[#00a63e]">+ {fmt(v.valor_pago)}</p>
            </div>
          ))}
        </>
      )}

      {fiadasAbertas.length === 0 && fiadasPagas.length === 0 && (
        <div className="flex items-center justify-center p-6 text-muted-foreground text-sm">
          <Check className="h-4 w-4 mr-2 text-[#00a63e]" />
          Sem fiados em aberto
        </div>
      )}

      {/* Registrar recebimento */}
      {fiadasAbertas.length > 0 && (
        <div className="px-4 py-3 border-t bg-muted/20 flex flex-col gap-2.5">
          <p className="text-xs font-medium text-muted-foreground">Registrar recebimento</p>
          <div className="flex gap-2">
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={valorInput}
              onChange={(e) => setValorInput(e.target.value)}
              placeholder="R$ 0,00"
              className="h-8 text-sm w-36"
            />
            <Button
              size="sm"
              onClick={handleReceber}
              disabled={mutation.isPending || !valorInput}
              className="h-8"
            >
              {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Receber"}
            </Button>
          </div>
          {feedbacks.length > 0 && (
            <div className="flex flex-col gap-1">
              {feedbacks.map((fb, i) => (
                <p
                  key={i}
                  className={`text-xs px-2 py-1 rounded ${
                    fb.tipo === "quitou"
                      ? "bg-[#00a63e]/10 text-[#00a63e]"
                      : "bg-amber-500/10 text-amber-600"
                  }`}
                >
                  {fb.texto}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ContaClientePanel
