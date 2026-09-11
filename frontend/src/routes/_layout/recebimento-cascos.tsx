// [mcp-local harness] feature: fix-build-errors | plano: 1097e958 | 2026-09-11 20:07:01
// Corrige nomes de métodos CascosService (listarCascosEmAberto, listarAguardandoConfirmacao, listarHistorico) e adiciona requestBody obrigatório
// fix: nomes de métodos CascosService + requestBody obrigatório
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Package, RotateCcw, Search } from "lucide-react"
import { useState } from "react"

import { CascosService, type EmprestimoCascoPublic, UsersService } from "@/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import useCustomToast from "@/hooks/useCustomToast"
import { usePermissions } from "@/hooks/usePermissions"

const MODULE = "cascos"
const LABEL_EVENTO: Record<string, { label: string; className: string }> = {
  recebido:             { label: "Recebido",              className: "bg-sky-100 text-sky-800" },
  recebimento_desfeito: { label: "Recebimento desfeito",  className: "bg-amber-100 text-amber-800" },
  confirmado:           { label: "Confirmado",            className: "bg-emerald-100 text-emerald-800" },
  confirmacao_desfeita: { label: "Confirmação desfeita",  className: "bg-red-100 text-red-800" },
}

export const Route = createFileRoute("/_layout/recebimento-cascos")({
  component: RecebimentoCascos,
  beforeLoad: async () => {
    const perms = await UsersService.readUserPermissions()
    const canRead =
      perms.is_superuser ||
      perms.permissions.some((p) => p.module === MODULE && p.can_read)
    if (!canRead) {
      throw redirect({ to: "/" })
    }
  },
  head: () => ({
    meta: [{ title: "Recebimento de Cascos - Gás Favero" }],
  }),
})

function formatDate(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split("-")
  return `${dia}/${mes}/${ano}`
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("pt-BR")
}

function statusLabel(status: string): { label: string; className: string } {
  if (status === "devolvido") return { label: "Devolvido", className: "bg-emerald-100 text-emerald-800" }
  if (status === "recebido_aguardando") return { label: "Aguardando confirmação", className: "bg-sky-100 text-sky-800" }
  return { label: "Emprestado", className: "bg-amber-100 text-amber-800" }
}

function CascoSheet({
  casco,
  onClose,
  canConfirmar,
}: {
  casco: EmprestimoCascoPublic
  onClose: () => void
  canConfirmar: boolean
}) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [confirmando, setConfirmando] = useState(false)
  const [desfazendoRecebimento, setDesfazendoRecebimento] = useState(false)
  const [desfazendoConfirmacao, setDesfazendoConfirmacao] = useState(false)
  const [obsDesfazer, setObsDesfazer] = useState("")

  const diasAberto = casco.dias_em_aberto ?? 0

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["cascos", "em-aberto"] })
    queryClient.invalidateQueries({ queryKey: ["cascos", "aguardando"] })
    queryClient.invalidateQueries({ queryKey: ["cascos", "historico"] })
  }

  const mutReceber = useMutation({
    // requestBody agora obrigatório — passamos objeto vazio (observacao opcional)
    mutationFn: () => CascosService.receberCasco({ cascoId: casco.id, requestBody: {} }),
    onSuccess: () => {
      showSuccessToast("Devolução registrada — aguardando confirmação do gerente")
      invalidate()
      onClose()
    },
    onError: (err: any) => showErrorToast(err?.body?.detail ?? "Erro ao registrar devolução"),
  })

  const mutConfirmar = useMutation({
    mutationFn: () => CascosService.confirmarDevolucaoCasco({ cascoId: casco.id, requestBody: {} }),
    onSuccess: () => {
      showSuccessToast("Devolução confirmada — casco baixado")
      invalidate()
      onClose()
    },
    onError: (err: any) => showErrorToast(err?.body?.detail ?? "Erro ao confirmar devolução"),
  })

  const mutDesfazerRecebimento = useMutation({
    mutationFn: () => CascosService.desfazerRecebimentoCasco({
      cascoId: casco.id,
      requestBody: { observacao: obsDesfazer || null },
    }),
    onSuccess: () => {
      showSuccessToast("Recebimento desfeito — casco retornou para 'Emprestado'")
      invalidate()
      onClose()
    },
    onError: (err: any) => showErrorToast(err?.body?.detail ?? "Erro ao desfazer recebimento"),
  })

  const mutDesfazerConfirmacao = useMutation({
    mutationFn: () => CascosService.desfazerConfirmacaoCasco({
      cascoId: casco.id,
      requestBody: { observacao: obsDesfazer || null },
    }),
    onSuccess: () => {
      showSuccessToast("Confirmação desfeita — casco retornou para 'Aguardando confirmação'")
      invalidate()
      onClose()
    },
    onError: (err: any) => showErrorToast(err?.body?.detail ?? "Erro ao desfazer confirmação"),
  })

  const st = statusLabel(casco.status)

  return (
    <div className="flex flex-col gap-5 p-1">
      <div className="rounded-lg border bg-muted/30 p-3 flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Cliente</span>
          <span className="font-medium">{casco.cliente_nome}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Produto</span>
          <span>{casco.produto_nome}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Quantidade</span>
          <span className="font-semibold">{casco.quantidade} casco{casco.quantidade !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Emprestado em</span>
          <span>{formatDate(casco.created_at)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Motorista</span>
          <span>{casco.motorista_nome ?? "—"}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Status</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.className}`}>
            {st.label}
          </span>
        </div>
        {diasAberto > 0 && casco.status !== "devolvido" && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Dias em aberto</span>
            <span className={diasAberto >= 30 ? "text-destructive font-semibold" : "text-amber-600"}>
              {diasAberto} dia{diasAberto !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {casco.recebido_em && (
        <div className="rounded-lg border bg-sky-50 dark:bg-sky-950/20 p-3 text-sm">
          <p className="font-medium text-sky-800 dark:text-sky-200">Recebimento físico registrado</p>
          <p className="text-muted-foreground text-xs">
            por {casco.recebido_por_nome ?? "?"} em {formatDateTime(casco.recebido_em)}
          </p>
        </div>
      )}

      {casco.confirmado_em && (
        <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 p-3 text-sm">
          <p className="font-medium text-emerald-800 dark:text-emerald-200">Devolução confirmada pelo gerente</p>
          <p className="text-muted-foreground text-xs">
            por {casco.confirmado_por_nome ?? "?"} em {formatDateTime(casco.confirmado_em)}
          </p>
        </div>
      )}

      {(casco.logs ?? []).length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Histórico de eventos</p>
          <div className="flex flex-col gap-1.5">
            {(casco.logs ?? []).map((log) => {
              const ev = LABEL_EVENTO[log.evento] ?? { label: log.evento, className: "bg-muted text-muted-foreground" }
              return (
                <div key={log.id} className="rounded border bg-muted/20 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ev.className}`}>
                      {ev.label}
                    </span>
                    <span className="text-muted-foreground">{formatDateTime(log.created_at)}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">por {log.usuario_nome ?? "?"}</p>
                  {log.observacao && <p className="mt-0.5 italic text-muted-foreground">"{log.observacao}"</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {casco.status === "emprestado" && (
        <Button onClick={() => mutReceber.mutate()} disabled={mutReceber.isPending}>
          {mutReceber.isPending ? "Registrando..." : "Registrar devolução física"}
        </Button>
      )}

      {casco.status === "recebido_aguardando" && canConfirmar && (
        !confirmando ? (
          <Button onClick={() => setConfirmando(true)}>
            Confirmar devolução (baixa formal)
          </Button>
        ) : (
          <div className="flex flex-col gap-3 rounded-lg border-2 border-primary bg-primary/5 p-4">
            <p className="text-sm font-semibold">Confirmar baixa formal do casco?</p>
            <p className="text-xs text-muted-foreground">Esta ação marca o casco como definitivamente devolvido. Pode ser desfeita em até 60 dias.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => mutConfirmar.mutate()} disabled={mutConfirmar.isPending}>
                {mutConfirmar.isPending ? "Confirmando..." : "Sim, confirmar"}
              </Button>
              <Button variant="outline" onClick={() => setConfirmando(false)} disabled={mutConfirmar.isPending}>Cancelar</Button>
            </div>
          </div>
        )
      )}

      {casco.status === "recebido_aguardando" && !canConfirmar && (
        <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:border-sky-800 dark:bg-sky-950/20 dark:text-sky-200">
          Aguardando confirmação do gerente para dar baixa formal.
        </div>
      )}

      {casco.status === "recebido_aguardando" && (
        !desfazendoRecebimento ? (
          <Button
            variant="outline"
            className="gap-2 text-amber-700 border-amber-300 hover:bg-amber-50"
            onClick={() => setDesfazendoRecebimento(true)}
          >
            <RotateCcw className="h-4 w-4" />
            Desfazer recebimento
          </Button>
        ) : (
          <div className="flex flex-col gap-3 rounded-lg border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/20 p-4">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Desfazer recebimento físico?</p>
            <p className="text-xs text-muted-foreground">O casco voltará para o status "Emprestado". Esta ação fica registrada no log.</p>
            <Input placeholder="Motivo (opcional)" value={obsDesfazer} onChange={(e) => setObsDesfazer(e.target.value)} className="text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="border-amber-400 text-amber-800" onClick={() => mutDesfazerRecebimento.mutate()} disabled={mutDesfazerRecebimento.isPending}>
                {mutDesfazerRecebimento.isPending ? "Desfazendo..." : "Confirmar"}
              </Button>
              <Button variant="outline" onClick={() => { setDesfazendoRecebimento(false); setObsDesfazer("") }}>Cancelar</Button>
            </div>
          </div>
        )
      )}

      {casco.status === "devolvido" && canConfirmar && (
        !desfazendoConfirmacao ? (
          <Button
            variant="outline"
            className="gap-2 text-amber-700 border-amber-300 hover:bg-amber-50"
            onClick={() => setDesfazendoConfirmacao(true)}
          >
            <RotateCcw className="h-4 w-4" />
            Desfazer confirmação
          </Button>
        ) : (
          <div className="flex flex-col gap-3 rounded-lg border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/20 p-4">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Desfazer baixa formal?</p>
            <p className="text-xs text-muted-foreground">O casco voltará para "Aguardando confirmação". Permitido até 60 dias após a confirmação.</p>
            <Input placeholder="Motivo (opcional)" value={obsDesfazer} onChange={(e) => setObsDesfazer(e.target.value)} className="text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="border-amber-400 text-amber-800" onClick={() => mutDesfazerConfirmacao.mutate()} disabled={mutDesfazerConfirmacao.isPending}>
                {mutDesfazerConfirmacao.isPending ? "Desfazendo..." : "Confirmar"}
              </Button>
              <Button variant="outline" onClick={() => { setDesfazendoConfirmacao(false); setObsDesfazer("") }}>Cancelar</Button>
            </div>
          </div>
        )
      )}

      <Button variant="outline" onClick={onClose}>Fechar</Button>
    </div>
  )
}

function RecebimentoCascos() {
  const [busca, setBusca] = useState("")
  const [cascoSelecionado, setCascoSelecionado] = useState<EmprestimoCascoPublic | null>(null)
  const [aba, setAba] = useState<"aberto" | "aguardando" | "historico">("aberto")

  const { canDelete } = usePermissions()
  const canConfirmar = canDelete(MODULE)

  const { data: emAbertoData, isLoading: loadingAberto } = useQuery({
    queryKey: ["cascos", "em-aberto"],
    // nome correto: listarCascosEmAberto
    queryFn: () => CascosService.listarCascosEmAberto(),
  })

  const { data: aguardandoData, isLoading: loadingAguardando } = useQuery({
    queryKey: ["cascos", "aguardando"],
    // nome correto: listarAguardandoConfirmacao
    queryFn: () => CascosService.listarAguardandoConfirmacao(),
  })

  const { data: historicoData, isLoading: loadingHistorico } = useQuery({
    queryKey: ["cascos", "historico"],
    // nome correto: listarHistorico
    queryFn: () => CascosService.listarHistorico(),
    enabled: aba === "historico",
  })

  const cascos =
    aba === "aberto"
      ? (emAbertoData?.data ?? []).filter((c) => c.status === "emprestado")
      : aba === "aguardando"
      ? (aguardandoData?.data ?? [])
      : (historicoData?.data ?? [])

  const cascosFiltrados =
    busca.trim().length >= 2
      ? cascos.filter((c) =>
          c.cliente_nome.toLowerCase().includes(busca.toLowerCase()) ||
          c.produto_nome.toLowerCase().includes(busca.toLowerCase())
        )
      : cascos

  const isLoading =
    aba === "aberto" ? loadingAberto : aba === "aguardando" ? loadingAguardando : loadingHistorico

  const totalAberto = (emAbertoData?.data ?? []).filter((c) => c.status === "emprestado").length
  const totalAguardando = aguardandoData?.count ?? 0
  const totalHistorico = historicoData?.count ?? 0

  const abas = [
    { id: "aberto" as const, label: "Emprestados", count: totalAberto, colorActive: "border-amber-400 bg-amber-50 dark:bg-amber-950/20" },
    { id: "aguardando" as const, label: "Aguardando confirmação", count: totalAguardando, colorActive: "border-sky-400 bg-sky-50 dark:bg-sky-950/20" },
    { id: "historico" as const, label: "Histórico (60 dias)", count: totalHistorico, colorActive: "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20" },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Recebimento de Cascos</h1>
        <p className="text-muted-foreground">
          Registre a devolução física e aguarde a confirmação do gerente.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {abas.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAba(a.id)}
            className={`rounded-lg border p-4 text-left transition-colors ${aba === a.id ? a.colorActive : "hover:bg-muted/40"}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">{a.label}</p>
            </div>
            <p className="text-3xl font-bold">{a.count}</p>
          </button>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por cliente ou produto..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : cascosFiltrados.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
            {aba === "aberto"
              ? "Nenhum casco em aberto."
              : aba === "aguardando"
              ? "Nenhum casco aguardando confirmação."
              : "Nenhum casco confirmado nos últimos 60 dias."}
          </div>
        ) : (
          cascosFiltrados.map((casco) => {
            const st = statusLabel(casco.status)
            const diasAberto = casco.dias_em_aberto ?? 0
            const critico = diasAberto >= 30 && casco.status !== "devolvido"
            return (
              <button
                key={casco.id}
                type="button"
                onClick={() => setCascoSelecionado(casco)}
                className={`rounded-lg border p-4 text-left hover:bg-muted/40 transition-colors w-full ${critico ? "border-destructive/40" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <p className="font-medium">{casco.cliente_nome}</p>
                    <p className="text-sm text-muted-foreground">
                      {casco.produto_nome} · {casco.quantidade} casco{casco.quantidade !== 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Emprestado em {formatDate(casco.created_at)} por {casco.motorista_nome ?? "?"}
                    </p>
                    {casco.confirmado_em && (
                      <p className="text-xs text-emerald-700 dark:text-emerald-400">
                        Devolvido em {formatDateTime(casco.confirmado_em)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.className}`}>
                      {st.label}
                    </span>
                    {diasAberto > 0 && casco.status !== "devolvido" && (
                      <span className={`text-xs font-semibold ${critico ? "text-destructive" : "text-amber-600"}`}>
                        {diasAberto}d em aberto
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>

      <Sheet open={!!cascoSelecionado} onOpenChange={(open) => { if (!open) setCascoSelecionado(null) }}>
        <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Detalhes do empréstimo</SheetTitle>
          </SheetHeader>
          {cascoSelecionado && (
            <CascoSheet
              casco={cascoSelecionado}
              onClose={() => setCascoSelecionado(null)}
              canConfirmar={canConfirmar}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
