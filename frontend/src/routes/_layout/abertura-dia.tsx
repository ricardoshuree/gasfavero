// [mcp-local harness] feature: abertura-dia-frontend | plano: c2315bde | 2026-09-04 15:21:19
// Tela de abertura do dia com lista de motoristas, modal de abertura com fundo de troco e modal de edição com senha do gerente
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { CheckCircle, Clock, Edit2, Unlock } from "lucide-react"
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

function hojeISO() {
  return new Date().toISOString().slice(0, 10)
}

function formatMoney(v: number) {
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

export const Route = createFileRoute("/_layout/abertura-dia")({
  component: AberturaDia,
  beforeLoad: async () => {
    const perms = await UsersService.readUserPermissions()
    const canRead =
      perms.is_superuser ||
      perms.permissions.some((p) => p.module === MODULE && p.can_read)
    if (!canRead) throw redirect({ to: "/" })
  },
  head: () => ({ meta: [{ title: "Abertura do Dia - Gasfavero" }] }),
})

interface StatusMotorista {
  motorista_id: string
  motorista_nome: string
  aberto: boolean
  abertura_id: string | null
  fundo_troco: number | null
  aberto_em: string | null
}

// ---------------------------------------------------------------------------
// Modal de abertura
// ---------------------------------------------------------------------------
function ModalAbertura({
  motorista,
  onClose,
  onSuccess,
}: {
  motorista: StatusMotorista
  onClose: () => void
  onSuccess: () => void
}) {
  const [fundo, setFundo] = useState("")
  const [loading, setLoading] = useState(false)
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const handleConfirmar = async () => {
    const valor = parseFloat(fundo.replace(",", "."))
    if (!valor || valor <= 0) return showErrorToast("Informe um valor válido")
    setLoading(true)
    try {
      await apiFetch("/fechamento/abertura", {
        method: "POST",
        body: JSON.stringify({
          motorista_id: motorista.motorista_id,
          fundo_troco: valor,
          data: hojeISO(),
        }),
      })
      showSuccessToast(`Abertura de ${motorista.motorista_nome} confirmada`)
      onSuccess()
      onClose()
    } catch (e: any) {
      showErrorToast(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Abertura do dia — {motorista.motorista_nome}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <Label htmlFor="fundo">Fundo de troco (R$)</Label>
          <Input
            id="fundo"
            type="text"
            inputMode="decimal"
            placeholder="Ex: 200,00"
            value={fundo}
            onChange={(e) => setFundo(e.target.value)}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmar} disabled={loading}>
            {loading ? "Confirmando..." : "Confirmar abertura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Modal de edição com senha do gerente
// ---------------------------------------------------------------------------
function ModalEdicao({
  motorista,
  onClose,
  onSuccess,
}: {
  motorista: StatusMotorista
  onClose: () => void
  onSuccess: () => void
}) {
  const [etapa, setEtapa] = useState<"senha" | "valor">("senha")
  const [email, setEmail] = useState("")
  const [senha, setSenha] = useState("")
  const [novoFundo, setNovoFundo] = useState(
    motorista.fundo_troco?.toFixed(2).replace(".", ",") ?? "",
  )
  const [loading, setLoading] = useState(false)
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const handleVerificarSenha = async () => {
    if (!email || !senha) return showErrorToast("Preencha email e senha")
    setLoading(true)
    try {
      await apiFetch("/fechamento/verificar-senha-gerente", {
        method: "POST",
        body: JSON.stringify({ email, senha }),
      })
      setEtapa("valor")
    } catch (e: any) {
      showErrorToast(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSalvar = async () => {
    const valor = parseFloat(novoFundo.replace(",", "."))
    if (!valor || valor <= 0) return showErrorToast("Informe um valor válido")
    setLoading(true)
    try {
      await apiFetch(`/fechamento/abertura/${motorista.abertura_id}`, {
        method: "PATCH",
        body: JSON.stringify({ novo_fundo_troco: valor }),
      })
      showSuccessToast("Fundo de troco atualizado")
      onSuccess()
      onClose()
    } catch (e: any) {
      showErrorToast(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {etapa === "senha"
              ? "Confirmação do gerente"
              : `Editar abertura — ${motorista.motorista_nome}`}
          </DialogTitle>
        </DialogHeader>

        {etapa === "senha" ? (
          <>
            <p className="text-sm text-muted-foreground">
              A edição da abertura requer o aval do gerente. Informe as
              credenciais para continuar.
            </p>
            <div className="grid gap-3 py-2">
              <div className="grid gap-1.5">
                <Label>Email do gerente</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Senha</Label>
                <Input
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleVerificarSenha()}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={loading}>
                Cancelar
              </Button>
              <Button onClick={handleVerificarSenha} disabled={loading}>
                {loading ? "Verificando..." : "Confirmar identidade"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="grid gap-3 py-2">
              <Label>Novo fundo de troco (R$)</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={novoFundo}
                onChange={(e) => setNovoFundo(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Um lançamento de ajuste será gerado pela diferença.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={loading}>
                Cancelar
              </Button>
              <Button onClick={handleSalvar} disabled={loading}>
                {loading ? "Salvando..." : "Salvar ajuste"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Tela principal
// ---------------------------------------------------------------------------
function AberturaDia() {
  const queryClient = useQueryClient()
  const [modalAbrir, setModalAbrir] = useState<StatusMotorista | null>(null)
  const [modalEditar, setModalEditar] = useState<StatusMotorista | null>(null)
  const hoje = hojeISO()

  const { data, isLoading } = useQuery({
    queryKey: ["abertura-status", hoje],
    queryFn: () => apiFetch(`/fechamento/status/${hoje}`),
    refetchInterval: 30000,
  })

  const motoristas: StatusMotorista[] = data?.motoristas ?? []
  const totalAbertos = motoristas.filter((m) => m.aberto).length

  const invalidar = () =>
    queryClient.invalidateQueries({ queryKey: ["abertura-status"] })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Abertura do Dia</h1>
        <p className="text-muted-foreground">
          Despache os motoristas e registre o fundo de troco de cada um.
        </p>
      </div>

      {/* Cards de resumo */}
      <div className="flex gap-4 flex-wrap">
        <div className="rounded-lg border p-4 min-w-[160px]">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            Data
          </p>
          <p className="text-lg font-bold mt-1">
            {new Date(hoje + "T12:00:00").toLocaleDateString("pt-BR")}
          </p>
        </div>
        <div className="rounded-lg border p-4 min-w-[160px]">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            Despachados
          </p>
          <p className="text-lg font-bold mt-1">
            {totalAbertos} / {motoristas.length}
          </p>
        </div>
        <div className="rounded-lg border p-4 min-w-[160px]">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            Total em troco
          </p>
          <p className="text-lg font-bold mt-1">
            {formatMoney(
              motoristas
                .filter((m) => m.aberto && m.fundo_troco)
                .reduce((s, m) => s + (m.fundo_troco ?? 0), 0),
            )}
          </p>
        </div>
      </div>

      {/* Lista de motoristas */}
      {isLoading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg border bg-muted/40"
            />
          ))}
        </div>
      ) : motoristas.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nenhum motorista cadastrado com role Motorista.
        </p>
      ) : (
        <div className="grid gap-3">
          {motoristas.map((m) => (
            <div
              key={m.motorista_id}
              className="flex items-center justify-between rounded-lg border p-4"
            >
              <div className="flex items-center gap-3">
                {m.aberto ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <Clock className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <p className="font-medium">{m.motorista_nome}</p>
                  {m.aberto && m.fundo_troco ? (
                    <p className="text-sm text-muted-foreground">
                      Fundo:{" "}
                      <span className="font-semibold text-foreground">
                        {formatMoney(m.fundo_troco)}
                      </span>
                      {m.aberto_em && (
                        <span>
                          {" "}
                          · Aberto às{" "}
                          {new Date(m.aberto_em).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Aguardando abertura
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {m.aberto ? (
                  <>
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      Despachado
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setModalEditar(m)}
                      title="Editar fundo de troco"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={() => setModalAbrir(m)}>
                    <Unlock className="h-4 w-4 mr-1" />
                    Abrir dia
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalAbrir && (
        <ModalAbertura
          motorista={modalAbrir}
          onClose={() => setModalAbrir(null)}
          onSuccess={invalidar}
        />
      )}
      {modalEditar && (
        <ModalEdicao
          motorista={modalEditar}
          onClose={() => setModalEditar(null)}
          onSuccess={invalidar}
        />
      )}
    </div>
  )
}


