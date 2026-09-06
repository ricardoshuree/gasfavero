// [mcp-local harness] feature: abertura-log-edicao | plano: afb4479e | 2026-09-05 23:08:43
// Adiciona icone de aviso nos lancamentos de ajuste de abertura no Dashboard de Saldos
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import {
  AlertTriangle,
  Banknote,
  Building2,
  CheckCircle,
  Clock,
  CreditCard,
  Receipt,
  XCircle,
} from "lucide-react"
import { useState } from "react"

import { UsersService } from "@/client"
import useCustomToast from "@/hooks/useCustomToast"

const MODULE = "fechamento"
const API = import.meta.env.VITE_API_URL

type Periodo = "hoje" | "semana" | "mes" | "ano"

interface DashboardData {
  periodo: string
  data_inicio: string
  data_fim: string
  resumo: {
    saldo_mestre: number
    total_transito: number
    total_fiado: number
    total_maquininha: number
  }
  motoristas: {
    motorista_id: string
    motorista_nome: string
    iniciais: string
    status: string
    fundo_troco: number
    saldo_transito: number
  }[]
  lancamentos: {
    descricao: string
    debito_numero: string
    credito_numero: string
    valor: number
    hora: string
    e_ajuste: boolean
  }[]
}

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

async function apiFetch(path: string): Promise<DashboardData> {
  const token = localStorage.getItem("access_token")
  const res = await fetch(`${API}/api/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).detail ?? "Erro na requisição")
  }
  return res.json()
}

export const Route = createFileRoute("/_layout/dashboard-saldos")({
  component: DashboardSaldos,
  beforeLoad: async () => {
    const perms = await UsersService.readUserPermissions()
    const canRead =
      perms.is_superuser ||
      perms.permissions.some((p) => p.module === MODULE && p.can_read)
    if (!canRead) throw redirect({ to: "/" })
  },
  head: () => ({ meta: [{ title: "Dashboard de Saldos - Gasfavero" }] }),
})

const PERIODOS: { value: Periodo; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mês" },
  { value: "ano", label: "Ano" },
]

function DashboardSaldos() {
  const [periodo, setPeriodo] = useState<Periodo>("hoje")
  const { showErrorToast } = useCustomToast()

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["dashboard-saldos", periodo],
    queryFn: () => apiFetch(`/fechamento/dashboard?periodo=${periodo}`),
    refetchInterval: 60000,
    throwOnError: (e: Error) => { showErrorToast(e.message); return false },
  })

  const resumo = data?.resumo
  const motoristas = data?.motoristas ?? []
  const lancamentos = data?.lancamentos ?? []

  const statusIcon = (status: string) => {
    if (status === "fechado") return <CheckCircle className="h-4 w-4 text-green-500" />
    if (status === "aberto") return <Clock className="h-4 w-4 text-primary" />
    return <XCircle className="h-4 w-4 text-muted-foreground" />
  }

  const statusLabel = (status: string) => {
    if (status === "fechado") return <span className="text-xs text-green-600 font-medium">Fechado</span>
    if (status === "aberto") return <span className="text-xs text-primary font-medium">Aberto</span>
    return <span className="text-xs text-muted-foreground">Sem abertura</span>
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard de Saldos</h1>
        <p className="text-muted-foreground">Posição financeira das contas da distribuidora.</p>
      </div>

      <div className="flex gap-2">
        {PERIODOS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriodo(p.value)}
            className={`px-4 py-1.5 rounded-lg border text-sm transition-all ${
              periodo === p.value
                ? "bg-primary text-primary-foreground border-primary font-medium"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted/40" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg bg-accent/10 p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2 uppercase tracking-wide font-medium">
              <Building2 className="h-3.5 w-3.5" aria-hidden />
              Conta mestre
            </div>
            <p className="text-xl font-bold text-primary">{fmt(resumo?.saldo_mestre ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">saldo disponível</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2 uppercase tracking-wide font-medium">
              <Banknote className="h-3.5 w-3.5" aria-hidden />
              Em trânsito
            </div>
            <p className="text-xl font-bold">{fmt(resumo?.total_transito ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">em poder dos motoristas</p>
          </div>
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2 uppercase tracking-wide font-medium">
              <Receipt className="h-3.5 w-3.5" aria-hidden />
              Fiado (a receber)
            </div>
            <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{fmt(resumo?.total_fiado ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">vales em aberto</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2 uppercase tracking-wide font-medium">
              <CreditCard className="h-3.5 w-3.5" aria-hidden />
              Maquininha
            </div>
            <p className="text-xl font-bold">{fmt(resumo?.total_maquininha ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">cartões a liquidar</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Caixa em trânsito por motorista
          </p>
          <div className="grid gap-2">
            {isLoading
              ? [1, 2, 3].map((i) => (
                  <div key={i} className="h-20 animate-pulse rounded-lg border bg-muted/40" />
                ))
              : motoristas.map((m) => (
                  <div key={m.motorista_id} className="rounded-lg border p-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center text-xs font-medium text-primary flex-shrink-0">
                      {m.iniciais}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {statusIcon(m.status)}
                        <span className="font-medium text-sm truncate">{m.motorista_nome}</span>
                        {statusLabel(m.status)}
                      </div>
                      <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                        <span>Fundo: <span className="text-foreground font-medium">{fmt(m.fundo_troco)}</span></span>
                        <span>Saldo: <span className={`font-medium ${m.saldo_transito > 0 ? "text-primary" : "text-muted-foreground"}`}>{fmt(m.saldo_transito)}</span></span>
                      </div>
                    </div>
                  </div>
                ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Lançamentos recentes
          </p>
          <div className="rounded-lg border overflow-hidden">
            {isLoading ? (
              <div className="h-40 animate-pulse bg-muted/40" />
            ) : lancamentos.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">Nenhum lançamento no período.</p>
            ) : (
              <div className="divide-y">
                {lancamentos.map((l, i) => (
                  <div key={i} className="px-3 py-2.5 flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {l.e_ajuste && (
                          <AlertTriangle
                            className="h-3.5 w-3.5 text-amber-500 flex-shrink-0"
                            title="Lançamento de ajuste de abertura"
                          />
                        )}
                        <p className="text-sm truncate">{l.descricao}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">{l.debito_numero} → {l.credito_numero}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-medium">{fmt(l.valor)}</p>
                      <p className="text-xs text-muted-foreground">{l.hora}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
