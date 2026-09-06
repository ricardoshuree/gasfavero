// [mcp-local harness] feature: gas-povo | plano: 9b775808 | 2026-09-06 00:11:44
// Tela de recebimento Gas do Povo: cards com valor gov + frete, badge de dias, botao marcar recebido
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { CheckCircle2, Clock, Truck } from "lucide-react"
import { useState } from "react"

import { UsersService } from "@/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import useCustomToast from "@/hooks/useCustomToast"

const MODULE = "gas_povo"
const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"

export const Route = createFileRoute("/_layout/recebimento-gas-povo")({
  component: RecebimentoGasPovo,
  beforeLoad: async () => {
    const perms = await UsersService.readUserPermissions()
    const canRead =
      perms.is_superuser ||
      perms.permissions.some((p) => p.module === MODULE && p.can_read)
    if (!canRead) throw redirect({ to: "/" })
  },
  head: () => ({
    meta: [{ title: "Recebimento Gás do Povo" }],
  }),
})

interface GasPovoVenda {
  id: string
  cliente_nome: string
  motorista_nome: string
  valor_total: string
  gas_povo_frete: string
  data_venda: string
  pago_em: string | null
  dias_em_aberto: number
}

interface RecebimentoData {
  pendentes: GasPovoVenda[]
  pendentes_qtd: number
  pendentes_valor: string
  recebidos_mes_qtd: number
  recebidos_mes_valor: string
}

function formatBRL(valor: string | number): string {
  return `R$ ${Number(valor).toFixed(2).replace(".", ",")}`
}

function formatDate(iso: string): string {
  const [ano, mes, dia] = iso.split("-")
  return `${dia}/${mes}/${ano}`
}

function Diasbadge({ dias }: { dias: number }) {
  if (dias >= 45) {
    return <Badge variant="destructive">{dias}d</Badge>
  }
  if (dias >= 30) {
    return (
      <Badge className="bg-amber-500 text-white hover:bg-amber-600">
        {dias}d
      </Badge>
    )
  }
  return <Badge variant="secondary">{dias}d</Badge>
}

function RecebimentoGasPovo() {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [marcando, setMarcando] = useState<string | null>(null)

  const { data, isLoading } = useQuery<RecebimentoData>({
    queryKey: ["gas-povo-recebimento"],
    queryFn: async () => {
      const token = localStorage.getItem("access_token")
      const res = await fetch(`${API}/api/v1/gas-povo/recebimento`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error("Erro ao carregar recebimento Gás do Povo")
      return res.json()
    },
  })

  const marcarRecebido = useMutation({
    mutationFn: async (vendaId: string) => {
      setMarcando(vendaId)
      const token = localStorage.getItem("access_token")
      const res = await fetch(
        `${API}/api/v1/gas-povo/recebimento/${vendaId}/marcar-recebido`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        },
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.detail ?? "Erro ao marcar recebimento")
      }
      return res.json()
    },
    onSuccess: () => {
      showSuccessToast("Pagamento do governo registrado!")
      queryClient.invalidateQueries({ queryKey: ["gas-povo-recebimento"] })
    },
    onError: (err: Error) => {
      showErrorToast(err.message)
    },
    onSettled: () => {
      setMarcando(null)
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Truck className="h-6 w-6" />
          Recebimento Gás do Povo
        </h1>
        <p className="text-muted-foreground">
          Registre o pagamento do governo quando o depósito cair
        </p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground font-normal">Pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data?.pendentes_qtd ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground font-normal">Valor pendente</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold">{data ? formatBRL(data.pendentes_valor) : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground font-normal">Recebidos (mês)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data?.recebidos_mes_qtd ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground font-normal">Valor recebido (mês)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold">{data ? formatBRL(data.recebidos_mes_valor) : "—"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Lista de pendentes */}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">Aguardando pagamento do governo</p>

        {isLoading && (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        )}

        {!isLoading && data?.pendentes.length === 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <p className="text-sm text-green-800">Nenhuma venda pendente. Tudo recebido!</p>
          </div>
        )}

        {data?.pendentes.map((venda) => (
          <div
            key={venda.id}
            className="rounded-lg border bg-card p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{venda.cliente_nome}</span>
                <Diasbadge dias={venda.dias_em_aberto} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDate(venda.data_venda)}
                </span>
                <span>Motorista: {venda.motorista_nome}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm mt-1">
                <span>
                  Valor gov: <span className="font-medium">{formatBRL(venda.valor_total)}</span>
                </span>
                <span>
                  Frete cliente: <span className="font-medium">{formatBRL(venda.gas_povo_frete)}</span>
                </span>
                <span className="text-muted-foreground">
                  Total: <span className="font-semibold text-foreground">
                    {formatBRL(Number(venda.valor_total) + Number(venda.gas_povo_frete))}
                  </span>
                </span>
              </div>
            </div>

            <Button
              size="sm"
              onClick={() => marcarRecebido.mutate(venda.id)}
              disabled={marcando === venda.id}
              className="shrink-0"
            >
              {marcando === venda.id ? "Registrando..." : "Governo pagou ✓"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
