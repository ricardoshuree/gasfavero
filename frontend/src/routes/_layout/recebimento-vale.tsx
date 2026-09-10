// [mcp-local harness] feature: recebimento_melhorias_v2 | plano: 28e6cf57 | 2026-09-10 15:32:52
// Extrato abre automaticamente ao clicar cliente; onExtrato atualiza sem fechar
// Melhoria: extrato abre automaticamente ao clicar no cliente (handleAbrirCliente seta extratoAberto=true)
// onExtrato atualiza reciboVendas sem fechar o extrato
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { AlertCircle, Check, Clock, Search } from "lucide-react"
import { useState } from "react"

import { UsersService, VendasService, type ClientePublic } from "@/client"
import ContaClientePanel from "@/components/RecebimentoVale/ContaClientePanel"
import ReciboPanel from "@/components/RecebimentoVale/ReciboPanel"
import { ResumoCards } from "@/components/RecebimentoVale/ResumoCards"
import { Input } from "@/components/ui/input"

const MODULE = "vendas"

export const Route = createFileRoute("/_layout/recebimento-vale")({
  component: RecebimentoVale,
  beforeLoad: async () => {
    const perms = await UsersService.readUserPermissions()
    const canRead =
      perms.is_superuser ||
      perms.permissions.some((p) => p.module === MODULE && p.can_read)
    if (!canRead) throw redirect({ to: "/" })
  },
  head: () => ({ meta: [{ title: "Recebimento de Fiado - FastAPI Template" }] }),
})

function fmt(v: number | string): string {
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function useClientesComFiado(busca: string) {
  const { data, isLoading } = useQuery({
    queryKey: ["vales-recebimento-lista"],
    queryFn: () => VendasService.readValesRecebimento({ limit: 200, status: "todos" }),
  })

  const vendas = data?.data ?? []
  const mapaClientes = new Map<string, {
    cliente_id: string; cliente_nome: string; saldo: number; tem_atraso: boolean; vence_breve: boolean
  }>()

  for (const v of vendas) {
    const saldo = Number(v.valor_total) - Number(v.valor_pago)
    if (saldo <= 0) continue
    const existing = mapaClientes.get(v.cliente_id)
    const hoje = new Date()
    const vcto = v.data_pagamento_vale ? new Date(v.data_pagamento_vale) : null
    const atrasada = vcto ? vcto < hoje : false
    const vinceBreve = vcto ? !atrasada && (vcto.getTime() - hoje.getTime()) < 7 * 86400000 : false
    if (existing) {
      existing.saldo += saldo
      if (atrasada) existing.tem_atraso = true
      if (vinceBreve) existing.vence_breve = true
    } else {
      mapaClientes.set(v.cliente_id, { cliente_id: v.cliente_id, cliente_nome: v.cliente_nome, saldo, tem_atraso: atrasada, vence_breve: vinceBreve })
    }
  }

  const lista = Array.from(mapaClientes.values())
    .sort((a, b) => {
      if (a.tem_atraso && !b.tem_atraso) return -1
      if (!a.tem_atraso && b.tem_atraso) return 1
      return b.saldo - a.saldo
    })
    .filter((c) => !busca.trim() || c.cliente_nome.toLowerCase().includes(busca.toLowerCase()))

  return { lista, isLoading }
}

function RecebimentoVale() {
  const [busca, setBusca] = useState("")
  const [clienteSelecionado, setClienteSelecionado] = useState<{ id: string; nome: string; cpf: string } | null>(null)
  const [reciboVendas, setReciboVendas] = useState<any[]>([])
  const [extratoAberto, setExtratoAberto] = useState(false)

  const { lista, isLoading } = useClientesComFiado(busca)

  const { data: clienteData } = useQuery({
    queryKey: ["cliente-detalhe", clienteSelecionado?.id],
    queryFn: () =>
      fetch(
        `${import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"}/api/v1/clientes/${clienteSelecionado!.id}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` } }
      ).then((r) => r.json()),
    enabled: !!clienteSelecionado?.id,
    select: (data): ClientePublic => data,
  })

  function handleAbrirCliente(id: string, nome: string) {
    setClienteSelecionado({ id, nome, cpf: "" })
    setReciboVendas([])
    // Abre extrato automaticamente ao selecionar cliente
    setExtratoAberto(true)
  }

  function handleExtrato(vendas: any[]) {
    // Atualiza vendas do recibo sem fechar o extrato
    setReciboVendas(vendas)
  }

  function toggleExtrato() {
    setExtratoAberto((prev) => !prev)
  }

  const cpf = clienteData?.cpf ?? clienteSelecionado?.cpf ?? "—"

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Recebimento de Fiado</h1>
        <p className="text-muted-foreground text-sm">
          Conta-corrente por cliente — pagamentos são abatidos das folhas mais antigas.
        </p>
      </div>

      <ResumoCards />

      <div className={`grid gap-4 ${
        extratoAberto && clienteSelecionado
          ? "grid-cols-1 lg:grid-cols-[280px_1fr_280px]"
          : "grid-cols-1 lg:grid-cols-[280px_1fr]"
      }`}>

        {/* Col 1: lista */}
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar cliente..." className="pl-8 h-9" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>

          {isLoading && [1,2,3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border bg-muted/30" />
          ))}

          {!isLoading && lista.length === 0 && (
            <div className="flex items-center justify-center p-6 text-muted-foreground text-sm border rounded-xl border-dashed">
              <Check className="h-4 w-4 mr-2 text-[#00a63e]" />
              Sem fiados em aberto
            </div>
          )}

          {lista.map((c) => (
            <button key={c.cliente_id} type="button"
              onClick={() => handleAbrirCliente(c.cliente_id, c.cliente_nome)}
              className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${
                clienteSelecionado?.id === c.cliente_id ? "border-primary bg-primary/5" : "bg-card hover:border-border-strong"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium truncate">{c.cliente_nome}</span>
                <span className="text-sm font-medium text-destructive ml-2 flex-shrink-0">{fmt(c.saldo)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {c.tem_atraso && (
                  <span className="inline-flex items-center gap-1 text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                    <AlertCircle className="h-3 w-3" />Em atraso
                  </span>
                )}
                {!c.tem_atraso && c.vence_breve && (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">
                    <Clock className="h-3 w-3" />Vence em breve
                  </span>
                )}
                {!c.tem_atraso && !c.vence_breve && (
                  <span className="inline-flex items-center gap-1 text-xs text-[#00a63e] bg-[#00a63e]/10 px-1.5 py-0.5 rounded">
                    <Check className="h-3 w-3" />Em dia
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Col 2: conta */}
        {clienteSelecionado ? (
          <div className="flex flex-col gap-2">
            <div className="flex justify-end">
              <button type="button" onClick={toggleExtrato}
                className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  extratoAberto ? "border-primary text-primary bg-primary/5" : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                }`}
              >
                Extrato {extratoAberto ? "▸" : "◂"}
              </button>
            </div>
            <ContaClientePanel
              clienteId={clienteSelecionado.id}
              clienteNome={clienteSelecionado.nome}
              clienteCpf={cpf}
              onExtrato={handleExtrato}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-xl border border-dashed p-10 text-muted-foreground text-sm">
            Selecione um cliente para ver a conta
          </div>
        )}

        {/* Col 3: recibo */}
        {extratoAberto && clienteSelecionado && (
          <ReciboPanel clienteNome={clienteSelecionado.nome} clienteCpf={cpf} vendas={reciboVendas} />
        )}
      </div>
    </div>
  )
}

export default RecebimentoVale
