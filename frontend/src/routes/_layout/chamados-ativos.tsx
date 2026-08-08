// [mcp-local harness] feature: item16-chamados-ativos | plano: a49dfdf1 | 2026-08-08 14:24:05
// Tela /chamados-ativos: lista chamados pendente/aceita em cards (busca, FIFO por created_at), Cancelar (qualquer estado ativo) e Reatribuir (so pendente, combo com todos os motoristas + opcao "aberto")
// Tela "Chamados Ativos" -- ferramenta de gestão do atendente/gerente
// sobre chamados já despachados (pendente ou aceita). Não é uma tela
// de novo despacho (isso é /chamado) nem de visualização passiva
// (isso é /mapa) -- aqui o atendente CANCELA um chamado que não vai
// mais acontecer (cliente desistiu) ou REATRIBUI um chamado que foi
// despachado errado (era pro Rogerio, não pro Loris).
//
// GATE DE PERMISSÃO -- deliberadamente por "can_delete" no módulo
// "delegacao", NÃO "can_read": o Motorista tem Ver+Editar nesse
// módulo (precisa, pra usar o próprio app), mas nunca Apagar. Cancelar/
// reatribuir são ações exclusivas de quem tem Apagar (Admin/Gerente/
// Operador) -- mesmo gate que já protege os endpoints
// /cancelar e /reatribuir no backend (ver delegacao.py). Reforçado
// aqui na tela: mesmo que alguém digite a URL direto, o beforeLoad
// barra quem não tem a permissão.
//
// Reatribuir mostra TODOS os motoristas (disponíveis ou não) --
// decisão do Ricardo: o atendente pode saber de algo que o sistema
// não sabe (ex: motorista esqueceu de ativar o toggle mas está
// trabalhando normalmente).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { AlertCircle, Clock, MapPin } from "lucide-react"
import { useState } from "react"

import {
  type ApiError,
  type DemandaVendaPublic,
  DelegacaoService,
  type MotoristaDisponibilidadePublic,
  UsersService,
} from "@/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/ui/loading-button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

const MODULE = "delegacao"

export const Route = createFileRoute("/_layout/chamados-ativos")({
  component: ChamadosAtivos,
  beforeLoad: async () => {
    const perms = await UsersService.readUserPermissions()
    const canDelete =
      perms.is_superuser ||
      perms.permissions.some((p) => p.module === MODULE && p.can_delete)
    if (!canDelete) {
      throw redirect({ to: "/" })
    }
  },
  head: () => ({
    meta: [{ title: "Chamados Ativos - FastAPI Template" }],
  }),
})

// Polling -- essa tela existe pra alguém acompanhar ativamente, faz
// sentido atualizar sozinha sem precisar de F5 (mesmo espírito do
// polling do Mapa/app do motorista).
const INTERVALO_POLLING_MS = 20_000

function formatarEndereco(d: DemandaVendaPublic): string {
  const { rua_nome, numero, complemento, bairro_nome } = d.endereco
  const numeroComplemento = complemento ? `${numero} - ${complemento}` : numero
  return `${rua_nome}, ${numeroComplemento} — ${bairro_nome}`
}

function formatarItens(d: DemandaVendaPublic): string {
  if (!d.itens || d.itens.length === 0) return "(sem itens)"
  return d.itens.map((i) => `${i.quantidade}x ${i.produto_title}`).join(", ")
}

function formatarTempoDecorrido(isoDate: string): string {
  const minutos = Math.max(
    0,
    Math.floor((Date.now() - new Date(isoDate).getTime()) / 60_000),
  )
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return resto === 0 ? `${horas}h` : `${horas}h${resto}min`
}

function ChamadosAtivos() {
  const [busca, setBusca] = useState("")
  const [cancelando, setCancelando] = useState<DemandaVendaPublic | null>(null)
  const [reatribuindo, setReatribuindo] = useState<DemandaVendaPublic | null>(
    null,
  )

  const { data: demandas, isLoading } = useQuery({
    queryKey: ["demandasVenda"],
    queryFn: () => DelegacaoService.readDemandasVenda(),
    refetchInterval: INTERVALO_POLLING_MS,
  })

  const ativos = (demandas?.data ?? [])
    .filter((d) => d.status === "pendente" || d.status === "aceita")
    .filter((d) => {
      if (!busca.trim()) return true
      const alvo = busca.trim().toLowerCase()
      return (
        d.cliente_nome.toLowerCase().includes(alvo) ||
        (d.motorista_nome ?? "").toLowerCase().includes(alvo)
      )
    })
    // Mais antigo primeiro -- é uma fila de atenção do atendente, o
    // chamado esperando há mais tempo é o que mais precisa de olhar.
    .sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Chamados Ativos</h1>
        <p className="text-muted-foreground">
          Chamados pendentes ou aceitos, aguardando conclusão -- cancele um
          chamado que não vai mais acontecer, ou reatribua um chamado
          despachado pro motorista errado.
        </p>
      </div>

      <Input
        placeholder="Buscar por cliente ou motorista..."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="max-w-sm"
      />

      {isLoading && (
        <p className="text-muted-foreground">Carregando chamados...</p>
      )}

      {!isLoading && ativos.length === 0 && (
        <p className="text-muted-foreground">
          Nenhum chamado ativo no momento.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ativos.map((d) => (
          <CardChamadoAtivo
            key={d.id}
            demanda={d}
            onCancelar={() => setCancelando(d)}
            onReatribuir={() => setReatribuindo(d)}
          />
        ))}
      </div>

      <CancelarChamadoDialog
        demanda={cancelando}
        onClose={() => setCancelando(null)}
      />
      <ReatribuirChamadoDialog
        demanda={reatribuindo}
        onClose={() => setReatribuindo(null)}
      />
    </div>
  )
}

function CardChamadoAtivo({
  demanda: d,
  onCancelar,
  onReatribuir,
}: {
  demanda: DemandaVendaPublic
  onCancelar: () => void
  onReatribuir: () => void
}) {
  const aberto = d.motorista_id === null
  const aceito = d.status === "aceita"

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <Badge variant={aberto ? "destructive" : aceito ? "default" : "secondary"}>
          {aberto ? "Aberto" : aceito ? `Aceito · ${d.motorista_nome}` : `Convite · ${d.motorista_nome}`}
        </Badge>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {formatarTempoDecorrido(d.created_at)}
        </span>
      </div>

      <div>
        <p className="font-semibold">{d.cliente_nome}</p>
        <p className="flex items-start gap-1 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {formatarEndereco(d)}
        </p>
        <p className="text-sm text-muted-foreground">{formatarItens(d)}</p>
        {d.observacao && (
          <p className="flex items-start gap-1 text-xs italic text-muted-foreground">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            {d.observacao}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="flex-1"
          onClick={onCancelar}
        >
          Cancelar
        </Button>
        {d.status === "pendente" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onReatribuir}
          >
            Reatribuir
          </Button>
        )}
      </div>
    </div>
  )
}

function CancelarChamadoDialog({
  demanda,
  onClose,
}: {
  demanda: DemandaVendaPublic | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const mutation = useMutation({
    mutationFn: (demandaId: string) =>
      DelegacaoService.cancelarDemandaVenda({ demandaId }),
    onSuccess: () => {
      showSuccessToast("Chamado cancelado")
      onClose()
    },
    onError: (err: ApiError) => handleError.call(showErrorToast, err),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["demandasVenda"] })
    },
  })

  return (
    <Dialog open={demanda !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar chamado</DialogTitle>
          <DialogDescription>
            {demanda && (
              <>
                Cancelar o chamado de <strong>{demanda.cliente_nome}</strong>{" "}
                ({formatarEndereco(demanda)})? O motorista (se já tiver
                aceito) recebe um aviso sonoro e o chamado sai da fila dele.
                Essa ação não tem volta -- se for engano, é preciso despachar
                um chamado novo.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={mutation.isPending}>
              Voltar
            </Button>
          </DialogClose>
          <LoadingButton
            variant="destructive"
            loading={mutation.isPending}
            onClick={() => demanda && mutation.mutate(demanda.id)}
          >
            Cancelar chamado
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Sentinela pro <Select> -- mesmo padrão de /chamado.tsx (Radix não
// aceita value="" em SelectItem).
const CHAMADO_ABERTO = "__aberto__"

function ReatribuirChamadoDialog({
  demanda,
  onClose,
}: {
  demanda: DemandaVendaPublic | null
  onClose: () => void
}) {
  const [motoristaId, setMotoristaId] = useState(CHAMADO_ABERTO)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const { data: disponibilidade } = useQuery({
    queryKey: ["motoristas", "disponibilidade"],
    queryFn: () => DelegacaoService.readDisponibilidadeMotoristas(),
    enabled: demanda !== null,
  })
  // TODOS os motoristas (disponíveis ou não) -- decisão do Ricardo,
  // ver comentário no topo do arquivo.
  const motoristas: MotoristaDisponibilidadePublic[] = disponibilidade?.data ?? []

  const mutation = useMutation({
    mutationFn: (demandaId: string) =>
      DelegacaoService.reatribuirDemandaVenda({
        demandaId,
        requestBody: {
          motorista_id: motoristaId === CHAMADO_ABERTO ? null : motoristaId,
        },
      }),
    onSuccess: () => {
      showSuccessToast("Chamado reatribuído")
      setMotoristaId(CHAMADO_ABERTO)
      onClose()
    },
    onError: (err: ApiError) => handleError.call(showErrorToast, err),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["demandasVenda"] })
    },
  })

  return (
    <Dialog
      open={demanda !== null}
      onOpenChange={(open) => {
        if (!open) {
          setMotoristaId(CHAMADO_ABERTO)
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reatribuir chamado</DialogTitle>
          <DialogDescription>
            {demanda && (
              <>
                Chamado de <strong>{demanda.cliente_nome}</strong> --
                escolha o motorista certo, ou deixe aberto pra qualquer um
                aceitar. O motorista escolhido recebe um convite novo (não
                aceita automaticamente).
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <Select value={motoristaId} onValueChange={setMotoristaId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CHAMADO_ABERTO}>
              Chamado aberto (qualquer motorista)
            </SelectItem>
            {motoristas.map((m) => (
              <SelectItem key={m.motorista_id} value={m.motorista_id}>
                {m.motorista_nome} {m.disponivel ? "" : "(indisponível)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={mutation.isPending}>
              Cancelar
            </Button>
          </DialogClose>
          <LoadingButton
            loading={mutation.isPending}
            onClick={() => demanda && mutation.mutate(demanda.id)}
          >
            Reatribuir
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ChamadosAtivos
