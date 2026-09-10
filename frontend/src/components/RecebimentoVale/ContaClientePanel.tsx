// [mcp-local harness] feature: fix_estorno_ultimo_pagamento | plano: 2e8ff33a | 2026-09-10 18:28:22
// Lista unificada sessão+histórico ordenada por data; botão Estornar sempre no item mais recente tipo=recebimento
// fix: botão Estornar sempre no último pagamento recebido (sessão + histórico unificados)
// O item mais recente da lista unificada sempre tem Estornar disponível
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

// Item unificado de histórico (sessão atual OU histórico persistido)
interface ItemHistorico {
  id: string
  descricao: string
  valor: number
  dataRef: string          // ISO — para ordenação
  dataExibicao: string     // localeDateString — para exibição
  tipo: "recebimento" | "estorno"
  origem: "sessao" | "historico"
  // dados para estorno
  vendaId: string
  isMix: boolean
  pagamentoId?: string
}

export function ContaClientePanel({ clienteId, clienteNome, clienteCpf, onExtrato }: Props) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const inputRef = useRef<HTMLInputElement>(null)

  const [valorInput, setValorInput] = useState("")
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  // Lançamentos da sessão atual — adicionados à lista unificada
  const [lancamentosSessao, setLancamentosSessao] = useState<ItemHistorico[]>([])
  const [estornandoId, setEstornandoId] = useState<string | null>(null)

  const { data: historico, isLoading } = useQuery({
    queryKey: ["historico-fiado", clienteId],
    queryFn: () => VendasService.readHistoricoVendasCliente({ clienteId, limit: 50 }),
    enabled: !!clienteId,
  })

  const vendas = historico?.data ?? []

  const vendasChave = vendas.map((v) => {
    const pgtosPago = (v.pagamentos ?? []).map((p) => `${p.id}:${p.valor_pago ?? 0}`).join(",")
    return `${v.id}:${v.valor_pago}:${v.pago_em ?? ""}:${pgtosPago}`
  }).join("|")

  useEffect(() => {
    if (vendas.length > 0) onExtrato(vendas)
  }, [vendasChave])

  // ── Folhas em aberto ──────────────────────────────────────────────────────
  const fiadasAbertas: FolhaFiado[] = []
  for (const v of vendas) {
    if (v.status === "cancelada") continue

    if (v.forma_pagamento === "vale" && !v.pago_em) {
      const valorTotal = Number(v.valor_total)
      const valorPago = Number(v.valor_pago)
      const saldo = valorTotal - valorPago
      if (saldo <= 0) continue
      fiadasAbertas.push({
        vendaId: v.id, valeNumero: v.vale_numero ?? null,
        dataPagamentoVale: v.data_pagamento_vale ?? null,
        valorTotal, valorPago, saldo, isMix: false,
      })
    } else if (v.forma_pagamento === "mix") {
      for (const p of (v.pagamentos ?? [])) {
        if (p.forma_pagamento === "vale" && !p.pago_em) {
          const valorTotal = Number(p.valor)
          const valorPago = Number(p.valor_pago ?? 0)
          const saldo = valorTotal - valorPago
          if (saldo <= 0) continue
          fiadasAbertas.push({
            vendaId: v.id, valeNumero: p.vale_numero ?? null,
            dataPagamentoVale: p.data_pagamento_vale ?? null,
            valorTotal, valorPago, saldo,
            isMix: true, pagamentoId: p.id,
          })
        }
      }
    }
  }
  fiadasAbertas.sort((a, b) => (a.dataPagamentoVale ?? "").localeCompare(b.dataPagamentoVale ?? ""))

  // ── Histórico persistido: pagamentos recebidos do banco ───────────────────
  const historicoDb: ItemHistorico[] = []
  for (const v of vendas) {
    if (v.status === "cancelada") continue

    if (v.forma_pagamento === "vale") {
      // Parcial: valor_pago > 0 mas pago_em null
      if (!v.pago_em && Number(v.valor_pago) > 0) {
        const dataRef = v.recebido_em ?? v.created_at
        historicoDb.push({
          id: `db-${v.id}-parcial`,
          descricao: `Fiado nº ${v.vale_numero ?? "—"} parcial`,
          valor: Number(v.valor_pago),
          dataRef,
          dataExibicao: new Date(dataRef).toLocaleDateString("pt-BR"),
          tipo: "recebimento",
          origem: "historico",
          vendaId: v.id,
          isMix: false,
        })
      }
      // Quitado: pago_em preenchido
      if (v.pago_em) {
        historicoDb.push({
          id: `db-${v.id}-quitado`,
          descricao: `Fiado nº ${v.vale_numero ?? "—"} quitado`,
          valor: Number(v.valor_pago),
          dataRef: v.pago_em,
          dataExibicao: new Date(v.pago_em).toLocaleDateString("pt-BR"),
          tipo: "recebimento",
          origem: "historico",
          vendaId: v.id,
          isMix: false,
        })
      }
    } else if (v.forma_pagamento === "mix") {
      for (const p of (v.pagamentos ?? [])) {
        if (p.forma_pagamento !== "vale") continue
        const valorPago = Number(p.valor_pago ?? 0)
        if (valorPago <= 0) continue
        const dataRef = p.pago_em ?? v.created_at
        historicoDb.push({
          id: `db-${p.id}-pago`,
          descricao: p.pago_em
            ? `Fiado nº ${p.vale_numero ?? "—"} quitado (mix)`
            : `Fiado nº ${p.vale_numero ?? "—"} parcial (mix)`,
          valor: valorPago,
          dataRef,
          dataExibicao: new Date(dataRef).toLocaleDateString("pt-BR"),
          tipo: "recebimento",
          origem: "historico",
          vendaId: v.id,
          isMix: true,
          pagamentoId: p.id,
        })
      }
    }
  }

  // ── Lista unificada: sessão + histórico, mais recentes primeiro ───────────
  const todosItens: ItemHistorico[] = [
    ...lancamentosSessao,
    ...historicoDb,
  ].sort((a, b) => new Date(b.dataRef).getTime() - new Date(a.dataRef).getTime())
   .slice(0, 10) // limita exibição

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

  async function _invalidarEAtualizar() {
    await queryClient.invalidateQueries({ queryKey: ["historico-fiado", clienteId] })
    await queryClient.invalidateQueries({ queryKey: ["recebimentoValeResumo"] })
    await queryClient.invalidateQueries({ queryKey: ["vales-recebimento-lista"] })
    const novo = await VendasService.readHistoricoVendasCliente({ clienteId, limit: 50 })
    onExtrato(novo.data ?? [])
  }

  // ── Mutation: receber ─────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: async () => {
      const val = parseFloat(valorInput) || 0
      if (val <= 0) throw new Error("Informe um valor")
      let resto = val
      const novosItens: ItemHistorico[] = []
      const agora = new Date().toISOString()

      for (const folha of fiadasAbertas) {
        if (resto <= 0) break
        const valorEstaFolha = Math.min(resto, folha.saldo)

        if (folha.isMix) {
          if (!folha.pagamentoId) continue
          await VendasService.baixarPagamentoMix({
            id: folha.vendaId, pagamentoId: folha.pagamentoId,
            requestBody: { valor_pago: String(valorEstaFolha) },
          })
          const quitou = valorEstaFolha >= folha.saldo
          novosItens.push({
            id: crypto.randomUUID(), tipo: "recebimento", origem: "sessao",
            descricao: quitou
              ? `Fiado nº ${folha.valeNumero ?? "—"} quitado (mix)`
              : `Parcial — fiado nº ${folha.valeNumero ?? "—"} (mix)`,
            valor: valorEstaFolha,
            dataRef: agora,
            dataExibicao: new Date().toLocaleDateString("pt-BR") + " · esta sessão",
            vendaId: folha.vendaId, isMix: true, pagamentoId: folha.pagamentoId,
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
          }
          const quitou = valorEstaFolha >= folha.saldo
          novosItens.push({
            id: crypto.randomUUID(), tipo: "recebimento", origem: "sessao",
            descricao: quitou
              ? `Fiado nº ${folha.valeNumero ?? "—"} quitado`
              : `Parcial — fiado nº ${folha.valeNumero ?? "—"}`,
            valor: valorEstaFolha,
            dataRef: agora,
            dataExibicao: new Date().toLocaleDateString("pt-BR") + " · esta sessão",
            vendaId: folha.vendaId, isMix: false,
          })
        }
        resto -= valorEstaFolha
      }
      return novosItens
    },
    onSuccess: async (novosItens) => {
      showSuccessToast("Recebimento registrado")
      setValorInput("")
      setFeedbacks([])
      setLancamentosSessao((prev) => [...novosItens, ...prev])
      await _invalidarEAtualizar()
      setTimeout(() => inputRef.current?.focus(), 100)
    },
    onError: (err: any) => {
      showErrorToast(err?.body?.detail ?? "Erro ao registrar recebimento")
    },
  })

  // ── Mutation: estornar ────────────────────────────────────────────────────
  const mutationEstorno = useMutation({
    mutationFn: async (item: ItemHistorico) => {
      if (item.isMix && item.pagamentoId) {
        await VendasService.estornarPagamentoMix({
          id: item.vendaId, pagamentoId: item.pagamentoId,
          requestBody: { valor_estorno: String(item.valor) },
        })
      } else {
        await VendasService.estornarRecebimentoLegado({
          id: item.vendaId,
          requestBody: { valor_estorno: String(item.valor) },
        })
      }
      return item
    },
    onSuccess: async (item) => {
      showSuccessToast("Estorno registrado")
      const agora = new Date().toISOString()
      const itemEstorno: ItemHistorico = {
        id: crypto.randomUUID(), tipo: "estorno", origem: "sessao",
        descricao: `Estorno — ${item.descricao}`,
        valor: item.valor,
        dataRef: agora,
        dataExibicao: new Date().toLocaleDateString("pt-BR") + " · esta sessão",
        vendaId: item.vendaId, isMix: item.isMix, pagamentoId: item.pagamentoId,
      }
      // Remove o item estornado da sessão (se era da sessão) e adiciona o estorno
      setLancamentosSessao((prev) => [
        itemEstorno,
        ...prev.filter((l) => l.id !== item.id),
      ])
      await _invalidarEAtualizar()
      setEstornandoId(null)
    },
    onError: (err: any) => {
      showErrorToast(err?.body?.detail ?? "Erro ao estornar")
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

  // O item mais recente da lista unificada (tipo=recebimento) pode ser estornado
  const idUltimoRecebimento = todosItens.find((i) => i.tipo === "recebimento")?.id ?? null

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

      {/* Histórico unificado */}
      {todosItens.length > 0 && (
        <>
          <div className="px-4 py-1.5 text-xs text-muted-foreground bg-muted/30 border-b border-t">
            Histórico de recebimentos
          </div>
          {todosItens.map((item) => {
            const isUltimo = item.id === idUltimoRecebimento
            const estornando = estornandoId === item.id
            return (
              <div key={item.id} className={`flex items-center gap-3 px-4 py-2 border-b last:border-0 ${item.origem === "historico" ? "opacity-80" : ""}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                  item.tipo === "estorno" ? "bg-amber-500/10" : "bg-[#00a63e]/10"
                }`}>
                  {item.tipo === "estorno"
                    ? <ArrowUp className="h-3.5 w-3.5 text-amber-500" />
                    : <ArrowDown className="h-3.5 w-3.5 text-[#00a63e]" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{item.descricao}</p>
                  <p className="text-xs text-muted-foreground">{item.dataExibicao}</p>
                </div>
                <div className="flex items-center gap-2">
                  <p className={`text-xs font-medium ${item.tipo === "estorno" ? "text-amber-500" : "text-[#00a63e]"}`}>
                    {item.tipo === "estorno" ? "- " : "+ "}{fmt(item.valor)}
                  </p>
                  {/* Botão Estornar: sempre no último recebimento */}
                  {isUltimo && item.tipo === "recebimento" && (
                    <button
                      type="button"
                      onClick={() => {
                        setEstornandoId(item.id)
                        mutationEstorno.mutate(item)
                      }}
                      disabled={estornando || mutationEstorno.isPending}
                      className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-0.5 border border-border rounded px-1.5 py-0.5"
                      title="Estornar este recebimento"
                    >
                      {estornando
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <><RotateCcw className="h-3 w-3" /> Estornar</>
                      }
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </>
      )}

      {fiadasAbertas.length === 0 && todosItens.length === 0 && (
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
              type="number" inputMode="decimal" step="0.01" min="0"
              value={valorInput}
              onChange={(e) => setValorInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="R$ 0,00"
              className="h-8 text-sm w-36"
              autoFocus
            />
            <Button size="sm" onClick={handleReceber} disabled={mutation.isPending || !valorInput} className="h-8">
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
