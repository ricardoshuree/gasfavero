// [mcp-local harness] feature: ajuste-cores-card-3 | plano: ddf76acb | 2026-08-08 15:46:04
// Corrige aberto badge (vermelho de verdade via style, dark:bg-destructive/60 do tema estava vencendo className) e botao Cancelar (cinza escuro via style)
// [mcp-local harness] feature: ajuste-cores-card-2 | plano: 8d780d64 | 2026-08-08 15:39:24
// Badge Aberto vermelho solido, botao Reatribuir amarelo #ffcc00 com texto preto, bloco central de dados com fundo branco proprio
// [mcp-local harness] feature: fix-n1-demandas-e-cores-card | plano: 46879d5c | 2026-08-08 15:27:52
// Ajusta cores do card: fundo cinza 35% (#A6A6A6), badge Aceito com fundo azul, texto de informacoes em preto
// Tela /chamados-ativos: layout em duas regiões.
//
// 1. Bloco "Chamados abertos" (topo) -- chamados sem motorista_id,
//    disponíveis pra qualquer um aceitar. Mais antigo no topo (fila
//    de atenção -- decisão do Ricardo, sessão 08/08, pra bater com o
//    mesmo critério usado nas raias abaixo).
// 2. Raias horizontais por motorista (abaixo) -- uma coluna por
//    usuário com role Motorista CADASTRADO, mesmo que não tenha
//    chamado ativo nenhum no momento (raia vazia = motorista ocioso,
//    informação útil por si só). Dentro de cada raia, mais antigo no
//    topo também.
//
// Antes disso a tela era um grid solto misturando aberto+atribuído,
// difícil de escanear rápido quem está com o quê. Ver mockup do
// Ricardo (sessão 08/08) que motivou essa reestruturação.
//
// Busca removida -- lista raramente passa de uma dúzia de itens
// ativos, não compensava o campo. No lugar, botão "Novo Chamado"
// direto pro /chamado (fecha o loop: depois de despachar, o
// atendente já cai nesta tela pra conferir o que acabou de criar).
//
// CORES DO CARD (ajustes sessão 08/08, três rodadas) -- o card usava
// só `border` (fundo transparente), que no tema escuro ficava preto e
// se misturava com o fundo da página. Fundo sólido cinza 35%
// (`#A6A6A6`) -- MESMO tom já usado no app do motorista pro card
// "Cancelado" (ver frontend-motorista) por motivo de acessibilidade,
// reaproveitado aqui por consistência.
//
// Bloco central de dados (nome/endereço/itens) ganhou fundo BRANCO
// próprio dentro do card cinza, pra destacar a informação principal
// do resto do card -- mesmo padrão nos cards de "Chamados abertos" e
// nas raias por motorista (mesmo componente CardChamadoAtivo
// reaproveitado nos dois lugares).
//
// ARMADILHA ENCONTRADA (3ª rodada) -- o badge "Aberto" e o botão
// "Cancelar" usam variant="destructive" do tema, que tem uma regra
// `dark:bg-destructive/60` (ver badge.tsx/button.tsx). Como o app roda
// em tema escuro, essa regra dark: vence um className comum
// (bg-red-600 etc) por ordem de precedência no CSS gerado -- mesmo
// com a classe "certa" no HTML, a cor rosa/salmão do tema continuava
// aparecendo. Corrigido usando `style` inline (maior especificidade
// que QUALQUER classe, inclusive dark:) em vez de className pra essas
// duas cores específicas.
//
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
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { AlertCircle, Clock, MapPin, Plus, User } from "lucide-react"
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

// Mais antigo primeiro -- critério único usado tanto no bloco
// "Chamados abertos" quanto dentro de cada raia de motorista.
function ordenarMaisAntigoPrimeiro(a: DemandaVendaPublic, b: DemandaVendaPublic) {
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
}

function ChamadosAtivos() {
  const [cancelando, setCancelando] = useState<DemandaVendaPublic | null>(null)
  const [reatribuindo, setReatribuindo] = useState<DemandaVendaPublic | null>(
    null,
  )

  const { data: demandas, isLoading } = useQuery({
    queryKey: ["demandasVenda"],
    queryFn: () => DelegacaoService.readDemandasVenda(),
    refetchInterval: INTERVALO_POLLING_MS,
  })

  // Lista completa de motoristas cadastrados (disponíveis ou não) --
  // usada pra montar uma raia por motorista mesmo que esteja ociosa
  // no momento. Mesma fonte já usada no combo de Reatribuir.
  const { data: disponibilidade } = useQuery({
    queryKey: ["motoristas", "disponibilidade"],
    queryFn: () => DelegacaoService.readDisponibilidadeMotoristas(),
  })
  const motoristas: MotoristaDisponibilidadePublic[] = (
    disponibilidade?.data ?? []
  )
    .slice()
    .sort((a, b) => a.motorista_nome.localeCompare(b.motorista_nome))

  const ativos = (demandas?.data ?? []).filter(
    (d) => d.status === "pendente" || d.status === "aceita",
  )

  const abertos = ativos
    .filter((d) => d.motorista_id === null)
    .sort(ordenarMaisAntigoPrimeiro)

  const porMotorista = (motoristaId: string) =>
    ativos
      .filter((d) => d.motorista_id === motoristaId)
      .sort(ordenarMaisAntigoPrimeiro)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Chamados Ativos
          </h1>
          <p className="text-muted-foreground">
            Chamados pendentes ou aceitos, aguardando conclusão -- cancele um
            chamado que não vai mais acontecer, ou reatribua um chamado
            despachado pro motorista errado.
          </p>
        </div>
        <Button asChild>
          <Link to="/chamado">
            <Plus className="mr-1 h-4 w-4" />
            Novo Chamado
          </Link>
        </Button>
      </div>

      {isLoading && (
        <p className="text-muted-foreground">Carregando chamados...</p>
      )}

      {!isLoading && (
        <>
          {/* Bloco "Chamados abertos" -- sem dono, qualquer motorista
              pode aceitar. Região própria pro olho ir direto aqui
              primeiro (são os que mais precisam de atenção). */}
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="mb-3 text-sm font-semibold text-muted-foreground">
              Chamados abertos
            </p>
            {abertos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum chamado aberto no momento.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {abertos.map((d) => (
                  <CardChamadoAtivo
                    key={d.id}
                    demanda={d}
                    onCancelar={() => setCancelando(d)}
                    onReatribuir={() => setReatribuindo(d)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Raias por motorista -- uma coluna por motorista
              cadastrado, mesmo que esteja vazia (informação útil:
              mostra quem está ocioso). Scroll horizontal se a lista
              de motoristas crescer. */}
          <div>
            <p className="mb-3 text-sm font-semibold text-muted-foreground">
              Chamados por motorista
            </p>
            {motoristas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum motorista cadastrado.
              </p>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-2">
                {motoristas.map((m) => (
                  <RaiaMotorista
                    key={m.motorista_id}
                    nome={m.motorista_nome}
                    disponivel={m.disponivel}
                    chamados={porMotorista(m.motorista_id)}
                    onCancelar={setCancelando}
                    onReatribuir={setReatribuindo}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

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

function RaiaMotorista({
  nome,
  disponivel,
  chamados,
  onCancelar,
  onReatribuir,
}: {
  nome: string
  disponivel: boolean
  chamados: DemandaVendaPublic[]
  onCancelar: (d: DemandaVendaPublic) => void
  onReatribuir: (d: DemandaVendaPublic) => void
}) {
  return (
    <div className="flex w-72 shrink-0 flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-2 border-b pb-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold leading-tight">{nome}</p>
          {!disponivel && (
            <p className="text-xs text-muted-foreground">Indisponível</p>
          )}
        </div>
      </div>

      {chamados.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Nenhum chamado atribuído a este motorista
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {chamados.map((d) => (
            <CardChamadoAtivo
              key={d.id}
              demanda={d}
              onCancelar={() => onCancelar(d)}
              onReatribuir={() => onReatribuir(d)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Fundo cinza 35% -- substitui o `border`-only (fundo transparente)
// que ficava preto no tema escuro e se misturava com a página. Mesmo
// tom já usado no app do motorista pro card "Cancelado".
const COR_FUNDO_CARD = "#A6A6A6"

// Amarelo do botão "Reatribuir" -- pedido explícito do Ricardo.
const COR_BOTAO_REATRIBUIR = "#ffcc00"

// Vermelho do badge "Aberto" e cinza escuro do botão "Cancelar" --
// aplicados via `style` (não `className`) porque o variant
// "destructive" do tema tem uma regra `dark:bg-destructive/60` que
// vence qualquer className comum no tema escuro (ver comentário no
// topo do arquivo).
const COR_BADGE_ABERTO = "#dc2626"
const COR_BOTAO_CANCELAR = "#3f3f46"

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
    <div
      className="flex flex-col gap-3 rounded-lg border p-3"
      style={{ backgroundColor: COR_FUNDO_CARD }}
    >
      <div className="flex items-center justify-between gap-2">
        <Badge
          variant={aberto ? "destructive" : aceito ? "default" : "secondary"}
          className={aceito ? "bg-blue-600 text-white hover:bg-blue-600" : undefined}
          style={aberto ? { backgroundColor: COR_BADGE_ABERTO, color: "#fff" } : undefined}
        >
          {aberto ? "Aberto" : aceito ? `Aceito · ${d.motorista_nome}` : `Convite · ${d.motorista_nome}`}
        </Badge>
        <span className="flex items-center gap-1 text-xs text-black">
          <Clock className="h-3 w-3" />
          {formatarTempoDecorrido(d.created_at)}
        </span>
      </div>

      {/* Bloco central de dados com fundo BRANCO próprio -- destaca a
          informação principal (nome/endereço/itens) do resto do card
          cinza. Mesmo padrão nos cards de "Chamados abertos" e nas
          raias por motorista (este componente é reaproveitado nos
          dois lugares). */}
      <div className="rounded-md border bg-white p-2">
        <p className="font-semibold text-black">{d.cliente_nome}</p>
        <p className="flex items-start gap-1 text-sm text-black">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {formatarEndereco(d)}
        </p>
        <p className="text-sm text-black">{formatarItens(d)}</p>
        {d.observacao && (
          <p className="flex items-start gap-1 text-xs italic text-black/70">
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
          style={{ backgroundColor: COR_BOTAO_CANCELAR }}
          onClick={onCancelar}
        >
          Cancelar
        </Button>
        {d.status === "pendente" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 border-transparent text-black hover:text-black"
            style={{ backgroundColor: COR_BOTAO_REATRIBUIR }}
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
