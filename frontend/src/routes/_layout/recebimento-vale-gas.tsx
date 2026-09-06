// [mcp-local harness] feature: recebimento-vale-gas-fix | plano: f36472ba | 2026-09-05 22:39:58
// Remove Badge e Switch nao usados, toggle manual, remove showSuccessToast
import { createFileRoute, redirect } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { UsersService } from "@/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import useCustomToast from "@/hooks/useCustomToast"

const MODULE = "vale_gas"
const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface BlocoInfo {
  primeira_folha: number
  ultima_folha: number
  data: string
}

interface ResumoEstabelecimento {
  bloco_id: string
  cliente_nome: string
  cliente_cpf: string
  blocos_info: BlocoInfo[]
  vendidos_mes_qtd: number
  vendidos_mes_valor: string
  pendente_baixa_qtd: number
  pendente_baixa_valor: string
}

interface Folha {
  venda_id: string
  numero: number
  data_venda: string
  valor_total: string
  recebido: boolean
  recebido_em: string | null
  dias_desde_venda: number
  dias_desde_recebimento: number | null
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/_layout/recebimento-vale-gas")({
  component: RecebimentoValeGas,
  beforeLoad: async () => {
    const perms = await UsersService.readUserPermissions()
    const canRead =
      perms.is_superuser ||
      perms.permissions.some((p) => p.module === MODULE && p.can_read)
    if (!canRead) throw redirect({ to: "/" })
  },
  head: () => ({
    meta: [{ title: "Recebimento de Vale Gás - Gás Favero" }],
  }),
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMoney(valor: string | number) {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatDate(iso: string) {
  const [ano, mes, dia] = iso.split("-")
  return `${dia}/${mes}/${ano}`
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("access_token")
  return { Authorization: `Bearer ${token}` }
}

async function fetchJson(url: string) {
  const res = await fetch(url, { headers: authHeaders() })
  if (!res.ok) throw new Error("Erro na requisição")
  return res.json()
}

// ---------------------------------------------------------------------------
// Contador de dias com cor
// ---------------------------------------------------------------------------

function DiasContador({ dias, recebido }: { dias: number; recebido: boolean }) {
  if (recebido) return null
  const cor =
    dias >= 45 ? "text-destructive font-bold" :
    dias >= 30 ? "text-orange-500 font-medium" :
    "text-muted-foreground"
  return <span className={`text-xs ${cor}`}>{dias}d</span>
}

// ---------------------------------------------------------------------------
// Toggle de folha (substitui Switch do shadcn que nao existe neste projeto)
// ---------------------------------------------------------------------------

function FolhaToggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled: boolean
  onChange: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? "bg-green-600" : "bg-muted-foreground/30"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Sheet lateral — folhas do estabelecimento
// ---------------------------------------------------------------------------

function FolhasSheet({
  blocoId,
  clienteNome,
  clienteCpf,
  open,
  onOpenChange,
}: {
  blocoId: string
  clienteNome: string
  clienteCpf: string
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const queryClient = useQueryClient()
  const { showErrorToast } = useCustomToast()

  const { data: folhas = [], isLoading } = useQuery<Folha[]>({
    queryKey: ["valeGasFolhas", blocoId],
    queryFn: () => fetchJson(`${API}/api/v1/vale-gas/recebimento/${blocoId}/folhas`),
    enabled: open,
    refetchInterval: open ? 10000 : false,
  })

  const toggleMutation = useMutation({
    mutationFn: async (vendaId: string) => {
      const res = await fetch(
        `${API}/api/v1/vale-gas/recebimento/${vendaId}/marcar-recebido`,
        { method: "PATCH", headers: authHeaders() },
      )
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || "Erro ao atualizar")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["valeGasFolhas", blocoId] })
      queryClient.invalidateQueries({ queryKey: ["valeGasRecebimento"] })
    },
    onError: (e: Error) => showErrorToast(e.message),
  })

  const pendentes = folhas.filter((f) => !f.recebido)
  const recebidas = folhas.filter((f) => f.recebido)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{clienteNome}</SheetTitle>
          <SheetDescription>{clienteCpf}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 mt-4 px-1 text-sm">
          {isLoading && (
            <p className="text-muted-foreground text-center py-8">Carregando...</p>
          )}

          {/* Pendentes */}
          {pendentes.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Pendentes de baixa
              </p>
              {pendentes.map((f) => (
                <div
                  key={f.venda_id}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium w-12">#{f.numero}</span>
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(f.data_venda)}
                      </span>
                      <span className="text-xs font-medium">
                        {formatMoney(f.valor_total)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <DiasContador dias={f.dias_desde_venda} recebido={false} />
                    <FolhaToggle
                      checked={false}
                      disabled={toggleMutation.isPending}
                      onChange={() => toggleMutation.mutate(f.venda_id)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {pendentes.length === 0 && !isLoading && (
            <div className="rounded-md bg-green-50 border border-green-200 px-3 py-4 text-center">
              <p className="text-sm text-green-700 font-medium">
                ✓ Nenhuma folha pendente
              </p>
            </div>
          )}

          {/* Recebidas (histórico 60 dias) */}
          {recebidas.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Recebidas (últimos 60 dias)
              </p>
              {recebidas.map((f) => (
                <div
                  key={f.venda_id}
                  className="flex items-center justify-between rounded-md border border-muted px-3 py-2 opacity-70"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium w-12 text-muted-foreground">
                      #{f.numero}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(f.data_venda)}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">
                        {formatMoney(f.valor_total)}
                      </span>
                      {f.recebido_em && (
                        <span className="text-xs text-green-600">
                          Recebido em {formatDate(f.recebido_em.split("T")[0])}
                          {f.dias_desde_recebimento !== null && (
                            <span className="text-muted-foreground ml-1">
                              · some em {60 - f.dias_desde_recebimento}d
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Toggle para desfazer dentro dos 60 dias */}
                  <FolhaToggle
                    checked={true}
                    disabled={toggleMutation.isPending}
                    onChange={() => toggleMutation.mutate(f.venda_id)}
                  />
                </div>
              ))}
            </div>
          )}

          {folhas.length === 0 && !isLoading && (
            <p className="text-muted-foreground text-center py-8">
              Nenhuma folha movimentada neste bloco.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Card de estabelecimento
// ---------------------------------------------------------------------------

function CardEstabelecimento({
  resumo,
  onBaixa,
}: {
  resumo: ResumoEstabelecimento
  onBaixa: () => void
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Info do estabelecimento */}
        <div className="flex flex-col gap-1 min-w-[180px]">
          <p className="font-semibold">{resumo.cliente_nome}</p>
          <p className="text-xs text-muted-foreground">{resumo.cliente_cpf}</p>
          <div className="mt-1 flex flex-col gap-0.5">
            {resumo.blocos_info.map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {b.primeira_folha} — {b.ultima_folha}
                </span>
                <span>{formatDate(b.data)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Vendidos no mês */}
        <div className="flex flex-col items-center gap-1 min-w-[120px]">
          <p className="text-xs text-muted-foreground">Vendidos no mês</p>
          <div className="flex items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-md border text-xl font-semibold">
              {resumo.vendidos_mes_qtd}
            </div>
            <span className="text-sm font-medium">
              {formatMoney(resumo.vendidos_mes_valor)}
            </span>
          </div>
        </div>

        {/* Pendente de baixa */}
        <div className="flex flex-col items-center gap-1 min-w-[140px]">
          <p className="text-xs text-muted-foreground">Pendente de baixa</p>
          <div className="flex items-center gap-2">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-md border text-xl font-semibold ${
                resumo.pendente_baixa_qtd > 0
                  ? "border-orange-400 text-orange-600"
                  : "border-green-400 text-green-600"
              }`}
            >
              {resumo.pendente_baixa_qtd}
            </div>
            <span
              className={`text-sm font-medium ${
                resumo.pendente_baixa_qtd > 0 ? "text-orange-600" : "text-green-600"
              }`}
            >
              {formatMoney(resumo.pendente_baixa_valor)}
            </span>
          </div>
        </div>

        {/* Botão baixa */}
        <Button
          className="bg-sky-700 text-white hover:bg-sky-800 self-end sm:self-center"
          onClick={onBaixa}
        >
          Baixa
        </Button>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

function RecebimentoValeGas() {
  const [blocoSelecionado, setBlocoSelecionado] =
    useState<ResumoEstabelecimento | null>(null)

  const { data: resumos = [], isLoading } = useQuery<ResumoEstabelecimento[]>({
    queryKey: ["valeGasRecebimento"],
    queryFn: () => fetchJson(`${API}/api/v1/vale-gas/recebimento`),
    refetchInterval: 30000,
  })

  const totalPendente = resumos.reduce((acc, r) => acc + r.pendente_baixa_qtd, 0)
  const totalPendenteValor = resumos.reduce(
    (acc, r) => acc + Number(r.pendente_baixa_valor),
    0,
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Recebimento de Vale Gás
        </h1>
        <p className="text-muted-foreground">
          Gerencie o recebimento das folhas de vale gás por estabelecimento —
          folha a folha.
        </p>
      </div>

      {/* Resumo geral */}
      {resumos.length > 0 && (
        <div className="flex gap-4 flex-wrap">
          <div className="rounded-xl border px-4 py-3 flex items-center gap-3">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-md border text-xl font-semibold ${
                totalPendente > 0
                  ? "border-orange-400 text-orange-600"
                  : "border-green-400 text-green-600"
              }`}
            >
              {totalPendente}
            </div>
            <div className="flex flex-col">
              <span
                className={`text-lg font-semibold ${
                  totalPendente > 0 ? "text-orange-600" : "text-green-600"
                }`}
              >
                {formatMoney(totalPendenteValor)}
              </span>
              <span className="text-xs text-muted-foreground">
                total pendente de baixa
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Lista de estabelecimentos */}
      {isLoading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl border bg-muted/40"
            />
          ))}
        </div>
      )}

      {!isLoading && resumos.length === 0 && (
        <p className="text-muted-foreground py-8 text-center">
          Nenhum estabelecimento com bloco de vale gás cadastrado.
        </p>
      )}

      {!isLoading && resumos.length > 0 && (
        <div className="flex flex-col gap-3">
          {resumos.map((r) => (
            <CardEstabelecimento
              key={r.bloco_id}
              resumo={r}
              onBaixa={() => setBlocoSelecionado(r)}
            />
          ))}
        </div>
      )}

      {/* Sheet lateral */}
      {blocoSelecionado && (
        <FolhasSheet
          blocoId={blocoSelecionado.bloco_id}
          clienteNome={blocoSelecionado.cliente_nome}
          clienteCpf={blocoSelecionado.cliente_cpf}
          open={!!blocoSelecionado}
          onOpenChange={(v) => {
            if (!v) setBlocoSelecionado(null)
          }}
        />
      )}
    </div>
  )
}
