// [mcp-local harness] feature: emprestimo_casco | plano: 67d4cd00 | 2026-09-07 16:31:08
// Fix: dias_em_aberto extraído como const com ?? 0 em todos os usos
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Package, Search } from "lucide-react"
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

  const diasAberto = casco.dias_em_aberto ?? 0

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["cascos", "em-aberto"] })
    queryClient.invalidateQueries({ queryKey: ["cascos", "aguardando"] })
  }

  const mutReceber = useMutation({
    mutationFn: () => CascosService.receberCasco({ cascoId: casco.id }),
    onSuccess: () => {
      showSuccessToast("Devolução registrada — aguardando confirmação do gerente")
      invalidate()
      onClose()
    },
    onError: (err: any) => showErrorToast(err?.body?.detail ?? "Erro ao registrar devolução"),
  })

  const mutConfirmar = useMutation({
    mutationFn: () => CascosService.confirmarDevolucaoCasco({ cascoId: casco.id }),
    onSuccess: () => {
      showSuccessToast("Devolução confirmada — casco baixado")
      invalidate()
      onClose()
    },
    onError: (err: any) => showErrorToast(err?.body?.detail ?? "Erro ao confirmar devolução"),
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
            <p className="text-xs text-muted-foreground">
              Esta ação marca o casco como definitivamente devolvido. Não pode ser desfeita.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => mutConfirmar.mutate()} disabled={mutConfirmar.isPending}>
                {mutConfirmar.isPending ? "Confirmando..." : "Sim, confirmar"}
              </Button>
              <Button variant="outline" onClick={() => setConfirmando(false)} disabled={mutConfirmar.isPending}>
                Cancelar
              </Button>
            </div>
          </div>
        )
      )}

      {casco.status === "recebido_aguardando" && !canConfirmar && (
        <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:border-sky-800 dark:bg-sky-950/20 dark:text-sky-200">
          Aguardando confirmação do gerente para dar baixa formal.
        </div>
      )}

      <Button variant="outline" onClick={onClose}>Fechar</Button>
    </div>
  )
}

function RecebimentoCascos() {
  const [busca, setBusca] = useState("")
  const [cascoSelecionado, setCascoSelecionado] = useState<EmprestimoCascoPublic | null>(null)
  const [aba, setAba] = useState<"aberto" | "aguardando">("aberto")

  const { canDelete } = usePermissions()
  const canConfirmar = canDelete(MODULE)

  const { data: emAbertoData, isLoading: loadingAberto } = useQuery({
    queryKey: ["cascos", "em-aberto"],
    queryFn: () => CascosService.readCascosEmAberto(),
  })

  const { data: aguardandoData, isLoading: loadingAguardando } = useQuery({
    queryKey: ["cascos", "aguardando"],
    queryFn: () => CascosService.readCascosAguardandoConfirmacao(),
  })

  const cascos = aba === "aberto"
    ? (emAbertoData?.data ?? []).filter((c) => c.status === "emprestado")
    : (aguardandoData?.data ?? [])

  const cascosFiltrados = busca.trim().length >= 2
    ? cascos.filter((c) =>
        c.cliente_nome.toLowerCase().includes(busca.toLowerCase()) ||
        c.produto_nome.toLowerCase().includes(busca.toLowerCase())
      )
    : cascos

  const isLoading = aba === "aberto" ? loadingAberto : loadingAguardando
  const totalAberto = (emAbertoData?.data ?? []).filter((c) => c.status === "emprestado").length
  const totalAguardando = aguardandoData?.count ?? 0

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Recebimento de Cascos</h1>
        <p className="text-muted-foreground">
          Registre a devolução física e aguarde a confirmação do gerente.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setAba("aberto")}
          className={`rounded-lg border p-4 text-left transition-colors ${aba === "aberto" ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : "hover:bg-muted/40"}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Package className="h-4 w-4 text-amber-600" aria-hidden="true" />
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Emprestados em aberto</p>
          </div>
          <p className="text-3xl font-bold text-amber-700 dark:text-amber-300">{totalAberto}</p>
          <p className="text-xs text-muted-foreground mt-1">cascos aguardando devolução</p>
        </button>

        <button
          type="button"
          onClick={() => setAba("aguardando")}
          className={`rounded-lg border p-4 text-left transition-colors ${aba === "aguardando" ? "border-sky-400 bg-sky-50 dark:bg-sky-950/20" : "hover:bg-muted/40"}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Package className="h-4 w-4 text-sky-600" aria-hidden="true" />
            <p className="text-sm font-medium text-sky-800 dark:text-sky-200">Aguardando confirmação</p>
          </div>
          <p className="text-3xl font-bold text-sky-700 dark:text-sky-300">{totalAguardando}</p>
          <p className="text-xs text-muted-foreground mt-1">recebidos, pendentes de baixa pelo gerente</p>
        </button>
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
            {aba === "aberto" ? "Nenhum casco em aberto." : "Nenhum casco aguardando confirmação."}
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
        <SheetContent className="w-[400px] sm:w-[460px] overflow-y-auto">
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
