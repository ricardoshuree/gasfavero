// [mcp-local harness] feature: carga-produtos-abertura-fechamento | plano: b7702599 | 2026-09-04 18:22:27
// Adiciona aba Produtos no modal de fechamento com retorno de botijões — informativo, não bloqueia
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import {
  AlertTriangle,
  Banknote,
  CheckCircle,
  CreditCard,
  Package,
  QrCode,
  Receipt,
  XCircle,
} from "lucide-react"
import { useState } from "react"

import { UsersService } from "@/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import useCustomToast from "@/hooks/useCustomToast"

const MODULE = "fechamento"
const API = import.meta.env.VITE_API_URL

const CEDULAS = [100, 50, 20, 10, 5, 2]
const MOEDAS = [1, 0.5, 0.25, 0.1, 0.05]

function hojeISO() {
  return new Date().toISOString().slice(0, 10)
}

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

async function apiFetch(path: string, options?: RequestInit) {
  const token = localStorage.getItem("access_token")
  const res = await fetch(`${API}/api/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? "Erro na requisição")
  }
  return res.json()
}

export const Route = createFileRoute("/_layout/fechamento-dia")({
  component: FechamentoDia,
  beforeLoad: async () => {
    const perms = await UsersService.readUserPermissions()
    const canRead =
      perms.is_superuser ||
      perms.permissions.some((p) => p.module === MODULE && p.can_read)
    if (!canRead) throw redirect({ to: "/" })
  },
  head: () => ({ meta: [{ title: "Fechamento do Dia - Gasfavero" }] }),
})

interface StatusMotorista {
  motorista_id: string
  motorista_nome: string
  aberto: boolean
  fechado: boolean
  abertura_id: string | null
  fundo_troco: number | null
}

interface CargaProduto {
  produto_id: string
  produto_nome: string
  carregado: number
}

interface Resumo {
  abertura_id: string
  fundo_troco: number
  total_dinheiro: number
  total_pix: number
  total_debito: number
  total_credito: number
  total_fiado: number
  total_esperado: number
  total_geral: number
  ja_fechado: boolean
  carga_produtos: CargaProduto[]
  vendas: { id: string; cliente_nome: string; forma_pagamento: string; valor_pago: number }[]
}

// ---------------------------------------------------------------------------
// Modal de fechamento
// ---------------------------------------------------------------------------
function ModalFechamento({
  motorista,
  resumo,
  onClose,
  onSuccess,
}: {
  motorista: StatusMotorista
  resumo: Resumo
  onClose: () => void
  onSuccess: () => void
}) {
  const [aba, setAba] = useState<"resumo" | "vendas" | "produtos" | "especie" | "diferenca">("resumo")
  const [contagem, setContagem] = useState<Record<number, number>>({})
  const [retorno, setRetorno] = useState<Record<string, number>>({})
  const [justificativa, setJustificativa] = useState("")
  const [loading, setLoading] = useState(false)
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const totalContado = [...CEDULAS, ...MOEDAS].reduce(
    (s, v) => s + (contagem[v] || 0) * v,
    0,
  )
  const diferenca = totalContado - resumo.total_esperado
  const temDiferenca = Math.abs(diferenca) >= 0.01
  const temCarga = resumo.carga_produtos?.length > 0

  const handleFechar = async () => {
    if (temDiferenca && !justificativa.trim()) {
      return showErrorToast("Informe a justificativa para a diferença de caixa")
    }
    setLoading(true)
    try {
      const retornoPayload = Object.entries(retorno)
        .map(([produto_id, quantidade_retorno]) => ({ produto_id, quantidade_retorno }))

      await apiFetch("/fechamento/fechar", {
        method: "POST",
        body: JSON.stringify({
          motorista_id: motorista.motorista_id,
          data: hojeISO(),
          abertura_id: resumo.abertura_id,
          contagem_especie: contagem,
          total_contado: totalContado,
          justificativa: justificativa || null,
          retorno_produtos: retornoPayload,
        }),
      })
      showSuccessToast(`Fechamento de ${motorista.motorista_nome} confirmado`)
      onSuccess()
      onClose()
    } catch (e: any) {
      showErrorToast(e.message)
    } finally {
      setLoading(false)
    }
  }

  type AbaType = "resumo" | "vendas" | "produtos" | "especie" | "diferenca"
  const abas: AbaType[] = temCarga
    ? ["resumo", "vendas", "produtos", "especie", "diferenca"]
    : ["resumo", "vendas", "especie", "diferenca"]

  const labelAba: Record<AbaType, string> = {
    resumo: "Resumo",
    vendas: `Vendas (${resumo.vendas.length})`,
    produtos: "Produtos",
    especie: "Conferência",
    diferenca: "Diferenças",
  }

  const labelForma: Record<string, string> = {
    dinheiro: "Dinheiro",
    pix: "Pix",
    cartao_debito: "Débito",
    cartao_credito: "Crédito",
    vale: "Vale/Fiado",
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fechamento — {motorista.motorista_nome}</DialogTitle>
        </DialogHeader>

        {/* Abas */}
        <div className="flex gap-1 border-b overflow-x-auto">
          {abas.map((a) => (
            <button
              key={a}
              onClick={() => setAba(a)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                aba === a
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {labelAba[a]}
              {a === "diferenca" && temDiferenca && (
                <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-amber-500" />
              )}
            </button>
          ))}
        </div>

        {/* Aba Resumo */}
        {aba === "resumo" && (
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Fundo de troco", valor: resumo.fundo_troco, icon: <Banknote className="h-4 w-4" /> },
                { label: "Dinheiro (vendas)", valor: resumo.total_dinheiro, icon: <Banknote className="h-4 w-4" /> },
                { label: "Pix", valor: resumo.total_pix, icon: <QrCode className="h-4 w-4" /> },
                { label: "Cartão Débito", valor: resumo.total_debito, icon: <CreditCard className="h-4 w-4" /> },
                { label: "Cartão Crédito", valor: resumo.total_credito, icon: <CreditCard className="h-4 w-4" /> },
                { label: "Fiado/Vale", valor: resumo.total_fiado, icon: <Receipt className="h-4 w-4" /> },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border p-3">
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                    {item.icon}
                    <span className="text-xs font-medium uppercase tracking-wide">{item.label}</span>
                  </div>
                  <p className="text-lg font-bold">{fmt(item.valor)}</p>
                </div>
              ))}
            </div>
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground font-medium">Esperado em espécie (dinheiro + fundo)</p>
              <p className="text-xl font-bold mt-1">{fmt(resumo.total_esperado)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Pix, cartão e fiado não entram na contagem física
              </p>
            </div>
          </div>
        )}

        {/* Aba Vendas */}
        {aba === "vendas" && (
          <div className="rounded-lg border overflow-hidden">
            {resumo.vendas.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">Nenhuma venda registrada hoje.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Cliente</th>
                    <th className="px-3 py-2 text-left font-medium">Forma</th>
                    <th className="px-3 py-2 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {resumo.vendas.map((v) => (
                    <tr key={v.id} className="border-b last:border-0">
                      <td className="px-3 py-2">{v.cliente_nome}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-xs">
                          {labelForma[v.forma_pagamento] ?? v.forma_pagamento}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{fmt(v.valor_pago)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Aba Produtos */}
        {aba === "produtos" && (
          <div className="grid gap-3">
            <p className="text-xs text-muted-foreground">
              Informe quantos botijões de cada produto voltaram no caminhão. O sistema calcula o vendido automaticamente.
            </p>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground bg-muted/30">
                    <th className="px-3 py-2 text-left font-medium">Produto</th>
                    <th className="px-3 py-2 text-center font-medium">Saiu</th>
                    <th className="px-3 py-2 text-center font-medium">Retornou</th>
                    <th className="px-3 py-2 text-center font-medium">Vendido</th>
                  </tr>
                </thead>
                <tbody>
                  {resumo.carga_produtos.map((c) => {
                    const ret = retorno[c.produto_id] ?? 0
                    const vendido = Math.max(0, c.carregado - ret)
                    return (
                      <tr key={c.produto_id} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium">{c.produto_nome}</td>
                        <td className="px-3 py-2 text-center">{c.carregado}</td>
                        <td className="px-3 py-2 text-center">
                          <Input
                            type="number"
                            min={0}
                            max={c.carregado}
                            value={retorno[c.produto_id] ?? ""}
                            placeholder="0"
                            onChange={(e) =>
                              setRetorno((prev) => ({
                                ...prev,
                                [c.produto_id]: Number(e.target.value) || 0,
                              }))
                            }
                            className="w-20 h-7 text-center mx-auto"
                          />
                        </td>
                        <td className={`px-3 py-2 text-center font-semibold ${vendido > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                          {vendido}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Package className="h-3 w-3" />
              Informativo — não bloqueia o fechamento
            </p>
          </div>
        )}

        {/* Aba Conferência */}
        {aba === "especie" && (
          <div className="grid gap-3">
            <div className="rounded-lg border p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Cédulas</p>
              <div className="grid grid-cols-3 gap-2">
                {CEDULAS.map((v) => (
                  <div key={v} className="flex items-center justify-between border rounded-md px-2 py-1.5">
                    <span className="text-sm text-muted-foreground">R$ {v}</span>
                    <Input
                      type="number"
                      min={0}
                      value={contagem[v] || ""}
                      placeholder="0"
                      onChange={(e) =>
                        setContagem({ ...contagem, [v]: Number(e.target.value) || 0 })
                      }
                      className="w-16 h-7 text-right border-0 border-b rounded-none px-1 focus-visible:ring-0"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Moedas</p>
              <div className="grid grid-cols-3 gap-2">
                {MOEDAS.map((v) => (
                  <div key={v} className="flex items-center justify-between border rounded-md px-2 py-1.5">
                    <span className="text-sm text-muted-foreground">R$ {v.toFixed(2).replace(".", ",")}</span>
                    <Input
                      type="number"
                      min={0}
                      value={contagem[v] || ""}
                      placeholder="0"
                      onChange={(e) =>
                        setContagem({ ...contagem, [v]: Number(e.target.value) || 0 })
                      }
                      className="w-16 h-7 text-right border-0 border-b rounded-none px-1 focus-visible:ring-0"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg bg-foreground text-background p-4 flex justify-between items-center">
              <span className="text-sm">Total contado</span>
              <span className="text-xl font-bold">{fmt(totalContado)}</span>
            </div>
          </div>
        )}

        {/* Aba Diferenças */}
        {aba === "diferenca" && (
          <div className="grid gap-3">
            <div className={`rounded-lg border p-4 ${temDiferenca ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : "border-green-400 bg-green-50 dark:bg-green-950/20"}`}>
              <div className="flex items-center gap-2 mb-3">
                {temDiferenca
                  ? <AlertTriangle className="h-5 w-5 text-amber-600" />
                  : <CheckCircle className="h-5 w-5 text-green-600" />}
                <span className={`font-semibold text-sm ${temDiferenca ? "text-amber-800 dark:text-amber-300" : "text-green-800 dark:text-green-300"}`}>
                  {temDiferenca ? "Divergência encontrada" : "Valores conferem"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Esperado</p>
                  <p className="font-semibold">{fmt(resumo.total_esperado)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Contado</p>
                  <p className="font-semibold">{fmt(totalContado)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Diferença</p>
                  <p className={`font-semibold ${diferenca < 0 ? "text-red-600" : diferenca > 0 ? "text-blue-600" : ""}`}>
                    {diferenca === 0 ? "R$ 0,00" : `${diferenca > 0 ? "+" : ""}${fmt(diferenca)}`}
                  </p>
                </div>
              </div>
            </div>

            {temDiferenca && (
              <div className="grid gap-1.5">
                <Label>Justificativa (obrigatória)</Label>
                <textarea
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  placeholder="Descreva o motivo da diferença..."
                  className="w-full border rounded-md p-2.5 text-sm min-h-[80px] bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-xs text-muted-foreground">
                  Lançamento automático:{" "}
                  {diferenca < 0
                    ? "D: Quebra de Caixa / C: Caixa em Trânsito"
                    : "D: Caixa em Trânsito / C: Sobra de Caixa"}{" "}
                  — {fmt(Math.abs(diferenca))}
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleFechar}
            disabled={loading || (temDiferenca && !justificativa.trim())}
            variant={temDiferenca ? "destructive" : "default"}
          >
            {loading ? "Confirmando..." : "Confirmar fechamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Tela principal
// ---------------------------------------------------------------------------
function FechamentoDia() {
  const hoje = hojeISO()
  const [motoristaSelecionado, setMotoristaSelecionado] = useState<StatusMotorista | null>(null)
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [loadingResumo, setLoadingResumo] = useState(false)
  const { showErrorToast } = useCustomToast()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["fechamento-status", hoje],
    queryFn: () => apiFetch(`/fechamento/status/${hoje}`),
    refetchInterval: 30000,
  })

  const motoristas: StatusMotorista[] = data?.motoristas ?? []
  const totalFechados = motoristas.filter((m) => m.fechado).length

  const handleAbrirFechamento = async (m: StatusMotorista) => {
    setLoadingResumo(true)
    try {
      const r = await apiFetch(`/fechamento/resumo/${m.motorista_id}/${hoje}`)
      setResumo(r)
      setMotoristaSelecionado(m)
    } catch (e: any) {
      showErrorToast(e.message)
    } finally {
      setLoadingResumo(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fechamento do Dia</h1>
        <p className="text-muted-foreground">
          Confira o malote de cada motorista e registre o fechamento.
        </p>
      </div>

      <div className="flex gap-4 flex-wrap">
        <div className="rounded-lg border p-4 min-w-[160px]">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Data</p>
          <p className="text-lg font-bold mt-1">
            {new Date(hoje + "T12:00:00").toLocaleDateString("pt-BR")}
          </p>
        </div>
        <div className="rounded-lg border p-4 min-w-[160px]">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Fechados</p>
          <p className="text-lg font-bold mt-1">{totalFechados} / {motoristas.length}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg border bg-muted/40" />
          ))}
        </div>
      ) : motoristas.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhum motorista com abertura registrada hoje.</p>
      ) : (
        <div className="grid gap-3">
          {motoristas.map((m) => (
            <div key={m.motorista_id} className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-3">
                {m.fechado ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : m.aberto ? (
                  <Banknote className="h-5 w-5 text-primary" />
                ) : (
                  <XCircle className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <p className="font-medium">{m.motorista_nome}</p>
                  <p className="text-sm text-muted-foreground">
                    {m.fechado
                      ? "Fechamento confirmado"
                      : m.aberto
                      ? `Aberto · Fundo ${m.fundo_troco ? fmt(m.fundo_troco) : "-"}`
                      : "Sem abertura hoje"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {m.fechado ? (
                  <Badge variant="outline" className="text-green-600 border-green-600">
                    Fechado
                  </Badge>
                ) : m.aberto ? (
                  <Button
                    size="sm"
                    onClick={() => handleAbrirFechamento(m)}
                    disabled={loadingResumo}
                  >
                    {loadingResumo ? "Carregando..." : "Fechar dia"}
                  </Button>
                ) : (
                  <Badge variant="secondary">Sem abertura</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {motoristaSelecionado && resumo && (
        <ModalFechamento
          motorista={motoristaSelecionado}
          resumo={resumo}
          onClose={() => { setMotoristaSelecionado(null); setResumo(null) }}
          onSuccess={() => refetch()}
        />
      )}
    </div>
  )
}
