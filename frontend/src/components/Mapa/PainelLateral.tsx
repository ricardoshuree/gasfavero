// [mcp-local harness] feature: painel-mapa-fundo-branco | plano: ecd6a9a8 | 2026-08-07 10:06:04
// Fundo sempre branco, independente do tema do sistema
// Painel lateral da tela Mapa (pedido do Ricardo, pensado pra rodar
// numa TV no escritório do gerente): 3 blocos empilhados --
//   1. Reservado (ainda sem definição do que vai aqui)
//   2. Ranking da Semana -- top 3 motoristas por quantidade de
//      vendas, semana corrente (domingo-sábado)
//   3. Chamadas hoje -- chamados de HOJE, ativos (pendente/aceita)
//      no topo com entrada dinâmica, concluídos embaixo com o
//      horário de atendimento. Reseta sozinho à meia-noite (filtro
//      de data no backend, não apaga histórico -- ver
//      GET /demandas-venda/hoje).
//
// FUNDO SEMPRE BRANCO de propósito (pedido do Ricardo): cores fixas
// (bg-white, text-slate-*) em vez das classes de tema (bg-card,
// text-muted-foreground, bg-primary) que mudam com o dark mode --
// esse painel roda numa TV fixa e não deve mudar de aparência se
// alguém trocar o tema do sistema em outra tela.
//
// Ícones em /images/ (frontend/public/images/) fornecidos pelo
// Ricardo -- ver instrução de troca no README do painel, se precisar
// substituir depois.
import { useQuery } from "@tanstack/react-query"
import { ArrowRight } from "lucide-react"

import { DelegacaoService, type DemandaVendaPublic, VendasService } from "@/client"

const POLLING_RANKING_MS = 60_000
const POLLING_CHAMADAS_MS = 12_000

// Cor fixa dos cabeçalhos dos blocos (mesmo tom em qualquer tema)
const HEADER_CLASS = "bg-teal-700 px-3 py-2 text-white"

function formatDataBR(iso: string): string {
  const [ano, mes, dia] = iso.split("-")
  return `${dia}/${mes}`
}

function formatHoraBR(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  })
}

function formatEnderecoCurto(demanda: DemandaVendaPublic): string {
  return `${demanda.endereco.rua_nome}, ${demanda.endereco.numero}`
}

// ---------------------------------------------------------------------------
// Bloco 1 -- reservado (Ricardo ainda não definiu o conteúdo)
// ---------------------------------------------------------------------------

function BlocoReservado() {
  return (
    <div className="flex h-28 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs text-slate-400">
      Reservado (em definição)
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bloco 2 -- Ranking da Semana
// ---------------------------------------------------------------------------

function RankingSemana() {
  const { data } = useQuery({
    queryKey: ["rankingSemana"],
    queryFn: () => VendasService.readRankingSemana(),
    refetchInterval: POLLING_RANKING_MS,
  })

  return (
    <div className="flex shrink-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className={HEADER_CLASS}>
        <p className="text-sm font-semibold">Ranking da Semana</p>
        {data && (
          <p className="text-xs opacity-90">
            Semana de {formatDataBR(data.periodo_inicio)} a{" "}
            {formatDataBR(data.periodo_fim)}
          </p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 p-3">
        {data?.motoristas.map((m) => (
          <div
            key={m.motorista_id}
            className="flex flex-col items-center gap-1 text-center"
          >
            <img
              src="/images/motorista-pendente.png"
              alt=""
              className="h-10 w-10 object-contain"
            />
            <p className="w-full truncate text-xs text-slate-500">
              {m.motorista_nome}
            </p>
            <p className="text-lg font-bold leading-none text-slate-900">
              {m.quantidade}
            </p>
          </div>
        ))}
        {data && data.motoristas.length === 0 && (
          <p className="col-span-3 text-center text-xs text-slate-400">
            Nenhuma venda essa semana ainda
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bloco 3 -- Chamadas hoje
// ---------------------------------------------------------------------------

function ChamadaAtivaRow({ demanda }: { demanda: DemandaVendaPublic }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-slate-50 p-2">
      <img
        src="/images/motorista-pendente.png"
        alt=""
        className="h-8 w-8 shrink-0 object-contain"
      />
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
      <img
        src="/images/produto-gas.png"
        alt=""
        className="h-8 w-8 shrink-0 object-contain"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">
          {demanda.cliente_nome}
        </p>
        <p className="truncate text-xs text-slate-500">
          {formatEnderecoCurto(demanda)}
        </p>
        <p className="truncate text-xs text-slate-500">
          {demanda.motorista_nome ?? "Aberto -- qualquer motorista"}
        </p>
      </div>
    </div>
  )
}

function ChamadaConcluidaRow({ demanda }: { demanda: DemandaVendaPublic }) {
  return (
    <div className="flex items-center gap-2 rounded-md p-2 opacity-80">
      <img
        src="/images/motorista-concluido.png"
        alt=""
        className="h-8 w-8 shrink-0 object-contain"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">
          {demanda.cliente_nome}
        </p>
        <p className="truncate text-xs text-slate-500">
          {formatEnderecoCurto(demanda)}
        </p>
        {demanda.finalizada_em && (
          <p className="text-xs text-red-600">
            Atendida às {formatHoraBR(demanda.finalizada_em)} h
          </p>
        )}
      </div>
    </div>
  )
}

function ChamadasHoje() {
  const { data } = useQuery({
    queryKey: ["demandasHoje"],
    queryFn: () => DelegacaoService.readDemandasHoje(),
    refetchInterval: POLLING_CHAMADAS_MS,
  })

  const todas = data?.data ?? []
  // Ativas: entrada dinâmica no topo -- já vem ordenado por
  // created_at desc do backend, então "mais recente primeiro" já é o
  // comportamento natural sem precisar reordenar aqui.
  const ativas = todas.filter(
    (d) => d.status === "pendente" || d.status === "aceita",
  )
  const concluidas = todas
    .filter((d) => d.status === "concluida")
    .sort((a, b) =>
      (b.finalizada_em ?? "").localeCompare(a.finalizada_em ?? ""),
    )

  const hojeLabel = new Date().toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className={`shrink-0 ${HEADER_CLASS}`}>
        <p className="text-sm font-semibold">Chamadas hoje ({hojeLabel})</p>
      </div>
      <div className="flex-1 overflow-y-auto bg-white p-2">
        <div className="flex flex-col gap-2">
          {ativas.map((d) => (
            <ChamadaAtivaRow key={d.id} demanda={d} />
          ))}
          {concluidas.map((d) => (
            <ChamadaConcluidaRow key={d.id} demanda={d} />
          ))}
          {ativas.length === 0 && concluidas.length === 0 && (
            <p className="p-4 text-center text-xs text-slate-400">
              Nenhum chamado hoje ainda
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

export function PainelLateral() {
  return (
    <div className="flex h-full w-[340px] shrink-0 flex-col gap-3">
      <BlocoReservado />
      <RankingSemana />
      <ChamadasHoje />
    </div>
  )
}

export default PainelLateral
