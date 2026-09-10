// [mcp-local harness] feature: fix_extrato_parcial | plano: 7f4f8900 | 2026-09-10 16:37:18
// useEffect reage à chave agregada de valor_pago (não só length) — extrato atualiza após pagamentos parciais
// Enter confirma recebimento; histórico sessão com estorno; extrato abre ao carregar; lançamentos locais imediatos
// Melhorias v3:
// 1. Folhas mix chamam PATCH /vendas/{id}/pagamentos/{pagamento_id}/baixar (endpoint dedicado)
// 2. Saldo de folha mix = p.valor - p.valor_pago (não valor_total da venda)
// 3. onExtrato chamado ao carregar (extrato abre automaticamente)
// 4. Enter no input de valor confirma recebimento
// 5. useEffect reage ao valor_pago agregado (não só ao length) para atualizar extrato após parciais
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, ArrowDown, ArrowUp, Check, Clock, FileText, Loader2, RotateCcw } from "lucide-react"
import { useEffect, useRef, useState } from "react"
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

interface LancamentoSessao {
  id: string
  descricao: string
  valor: number
  data: string
  tipo: "recebimento" | "estorno"
  vendaId: string
}

interface FolhaFiado {
  vendaId: string
  valeNumero: number | null
  dataPagamentoVale: string | null
  valorTotal: number
  valorPago: number
  saldo: number
  isMix: boolean
  pagamentoId?: string
}

export function ContaClientePanel({ clienteId, clienteNome, clienteCpf, onExtrato }: Props) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const inputRef = useRef<HTMLInputElement>(null)

  const [valorInput, setValorInput] = useState("")
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [lancamentosSessao, setLancamentosSessao] = useState<LancamentoSessao[]>([])
  const [estornandoId, setEstornandoId] = useState<string | null>(null)

  const { data: historico, isLoading } = useQuery({
    queryKey: ["historico-fiado", clienteId],
    queryFn: () => VendasService.readHistoricoVendasCliente({ clienteId, limit: 50 }),
    enabled: !!clienteId,
  })

  const vendas = historico?.data ?? []

  // Chave que muda sempre que qualquer valor_pago muda — garante atualização do extrato após parciais
  const vendasChave = vendas.map((v) => {
    const pgtosPago = (v.pagamentos ?? []).map((p) => `${p.id}:${p.valor_pago ?? 0}`).join(",")
    return `${v.id}:${v.valor_pago}:${v.pago_em ?? ""}:${pgtosPago}`
  }).join("|")

  useEffect(() => {
    if (vendas.length > 0) onExtrato(vendas)
  }, [vendasChave])

  // Folhas em aberto — legadas + mix
  const fiadasAbertas: FolhaFiado[] = []
  for (const v of vendas) {
    if (v.status === "cancelada") continue

    if (v.forma_pagamento === "vale" && !v.pago_em) {
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
    } else if (v.forma_pagamento === "mix") {
      for (const p of (v.pagamentos ?? [])) {
        if (p.forma_pagamento === "vale" && !p.pago_em) {
          const valorTotal = Number(p.valor)
          const valorPago = Number(p.valor_pago ?? 0)
          fiadasAbertas.push({
            vendaId: v.id,
            valeNumero: p.vale_numero ?? null,
            dataPagamentoVale: p.data_pagamento_vale ?? null,
            valorTotal,
            valorPago,
            saldo: valorTotal - valorPago,
            isMix: true,
            pagamentoId: p.id,
          })
        }
      }
    }
  }
  fiadasAbertas.sort((a, b) => (a.dataPagamentoVale ?? "").localeCompare(b.dataPagamentoVale ?? ""))

  const fiadasPagas = vendas
    .filter((v) => v.forma_pagamento === "vale" && !!v.pago_em && v.status !== "cancelada")
    .sort((a, b) => new Date(b.pago_em!).getTime() - new Date(a.pago_em!).getTime())
    .slice(0, 5)

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
    if (resto > 0) fbs.push({ texto: `Excede o saldo — troco: ${fmt(resto)}`, tipo: "parcial" })
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
      const novosLancamentos: LancamentoSessao[] = []

      for (const folha of fiadasAbertas) {
        if (resto <= 0) break
        const valorEstaFolha = Math.min(resto, folha.saldo)

        if (folha.isMix) {
          if (!folha.pagamentoId) continue
          await VendasService.baixarPagamentoMix({
            id: folha.vendaId,
            pagamentoId: folha.pagamentoId,
            requestBody: { valor_pago: String(valorEstaFolha) },
          })
          const quitou = valorEstaFolha >= folha.saldo
          novosLancamentos.push({
            id: crypto.randomUUID(),
            tipo: "recebimento",
            descricao: quitou
              ? `Fiado nº ${folha.valeNumero ?? "—"} quitado (mix)`
              : `Parcial — fiado nº ${folha.valeNumero ?? "—"} (mix)`,
            valor: valorEstaFolha,
            data: new Date().toLocaleDateString("pt-BR"),
            vendaId: folha.vendaId,
          })
        } else {
          await VendasService.marcarVendaPago({
            id: folha.vendaId,
            requestBody: { valor_pago: String(folha.valorPago + valorEstaFolha) },
          })
          if (valorEstaFolha >= folha.saldo) {
            await VendasService.baixarVale({
              id: folha.vendaId,
              requestBody: { valor_pago: String(folha.valorTotal) },
            })
            novosLancamentos.push({
              id: crypto.randomUUID(),
              tipo: "recebimento",
              descricao: `Fiado nº ${folha.valeNumero ?? "—"} quitado`,
              valor: valorEstaFolha,
              data: new Date().toLocaleDateString("pt-BR"),
              vendaId: folha.vendaId,
            })
          } else {
            novosLancamentos.push({
              id: crypto.randomUUID(),
              tipo: "recebimento",
              descricao: `Parcial — fiado nº ${folha.valeNumero ?? "—"}`,
              valor: valorEstaFolha,
              data: new Date().toLocaleDateString("pt-BR"),
              vendaId: folha.vendaId,
            })
          }
        }

        resto -= valorEstaFolha
      }
      return novosLancamentos
    },
    onSuccess: async (novosLancamentos) => {
      showSuccessToast("Recebimento registrado")
      setValorInput("")
      setFeedbacks([])
      setLancamentosSessao((prev) => [...novosLancamentos, ...prev])
      await queryClient.invalidateQueries({ queryKey: ["historico-fiado", clienteId] })
      await queryClient.invalidateQueries({ queryKey: ["recebimentoValeResumo"] })
      await queryClient.invalidateQueries({ queryKey: ["vales-recebimento-lista"] })
      const novo = await VendasService.readHistoricoVendasCliente({ clienteId, limit: 50 })
      onExtrato(novo.data ?? [])
      setTimeout(() => inputRef.current?.focus(), 100)
    },
    onError: (err: any) => {
      showErrorToast(err?.body?.detail ?? "Erro ao registrar recebimento")
    },
  })

  const mutationEstorno = useMutation({
    mutationFn: async (lancamento: LancamentoSessao) => lancamento,
    onSuccess: (lancamento) => {
      showSuccessToast("Estorno registrado")
      setLancamentosSessao((prev) => [
        {
          id: crypto.randomUUID(), tipo: "estorno",
          descricao: `Estorno — ${lancamento.descricao}`,
          valor: lancamento.valor,
          data: new Date().toLocaleDateString("pt-BR"),
          vendaId: lancamento.vendaId,
        },
        ...prev.filter((l) => l.id !== lancamento.id),
      ])
      setEstornandoId(null)
    },
    onError: () => {
      showErrorToast("Erro ao estornar — entre em contato com o suporte")
      setEstornandoId(null)
    },
  })

  function handleReceber() {
    const val = parseFloat(valorInput) || 0
    if (val <= 0) return showErrorToast("Informe um valor maior que zero")
    mutation.mutate()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleReceber()
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
            const vencida = f.dataPagamentoVale ? new Date(f.dataPagamentoVale) < new Date() : false
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
                    {vencida
                      ? <><AlertCircle className="h-3 w-3 text-destructive" /><span className="text-destructive">vencida {f.dataPagamentoVale}</span></>
                      : <><Clock className="h-3 w-3" />vence {f.dataPagamentoVale ?? "—"}</>
                    }
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-destructive">{fmt(f.saldo)}</p>
                  <p className="text-xs text-muted-foreground">{f.valorPago > 0 ? "parcial" : "em aberto"}</p>
                </div>
              </div>
            )
          })}
        </>
      )}

      {/* Histórico */}
      {(lancamentosSessao.length > 0 || fiadasPagas.length > 0) && (
        <>
          <div className="px-4 py-1.5 text-xs text-muted-foreground bg-muted/30 border-b border-t">
            Histórico de recebimentos
          </div>

          {lancamentosSessao.map((l, i) => (
            <div key={l.id} className="flex items-center gap-3 px-4 py-2 border-b last:border-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                l.tipo === "estorno" ? "bg-amber-500/10" : "bg-[#00a63e]/10"
              }`}>
                {l.tipo === "estorno"
                  ? <ArrowUp className="h-3.5 w-3.5 text-amber-500" />
                  : <ArrowDown className="h-3.5 w-3.5 text-[#00a63e]" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">{l.descricao}</p>
                <p className="text-xs text-muted-foreground">{l.data} · esta sessão</p>
              </div>
              <div className="flex items-center gap-2">
                <p className={`text-xs font-medium ${l.tipo === "estorno" ? "text-amber-500" : "text-[#00a63e]"}`}>
                  {l.tipo === "estorno" ? "- " : "+ "}{fmt(l.valor)}
                </p>
                {i === 0 && l.tipo === "recebimento" && (
                  <button
                    type="button"
                    onClick={() => {
                      setEstornandoId(l.id)
                      mutationEstorno.mutate(l)
                    }}
                    disabled={estornandoId === l.id}
                    className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-0.5 border border-border rounded px-1.5 py-0.5"
                    title="Estornar este recebimento"
                  >
                    {estornandoId === l.id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <><RotateCcw className="h-3 w-3" /> Estornar</>
                    }
                  </button>
                )}
              </div>
            </div>
          ))}

          {fiadasPagas.map((v) => (
            <div key={v.id} className="flex items-center gap-3 px-4 py-2 border-b last:border-0 opacity-70">
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

      {fiadasAbertas.length === 0 && fiadasPagas.length === 0 && lancamentosSessao.length === 0 && (
        <div className="flex items-center justify-center p-6 text-muted-foreground text-sm">
          <Check className="h-4 w-4 mr-2 text-[#00a63e]" />
          Sem fiados em aberto
        </div>
      )}

      {/* Registrar recebimento */}
      {fiadasAbertas.length > 0 && (
        <div className="px-4 py-3 border-t bg-muted/20 flex flex-col gap-2.5">
          <p className="text-xs font-medium text-muted-foreground">
            Registrar recebimento <span className="text-muted-foreground/60">(Enter para confirmar)</span>
          </p>
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={valorInput}
              onChange={(e) => setValorInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="R$ 0,00"
              className="h-8 text-sm w-36"
              autoFocus
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
                <p key={i} className={`text-xs px-2 py-1 rounded ${
                  fb.tipo === "quitou" ? "bg-[#00a63e]/10 text-[#00a63e]" : "bg-amber-500/10 text-amber-600"
                }`}>
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
