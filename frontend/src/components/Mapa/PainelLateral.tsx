// [mcp-local harness] feature: fix-build-errors | plano: 1097e958 | 2026-09-11 20:08:07
// Substitui AvisosMapaService por fetch direto + exporta helpers para mapa.tsx
// Painel lateral da tela Mapa — pensado para rodar numa TV no escritório.
// fix: AvisosMapaService via fetch direto enquanto client é regenerado
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, Loader2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { DelegacaoService, type DemandaVendaPublic, VendasService } from "@/client"
import { OpenAPI } from "@/client/core/OpenAPI"

const POLLING_RANKING_MS = 60_000
const POLLING_CHAMADAS_MS = 12_000
const POLLING_AVISOS_MS = 60_000

const HEADER_CLASS = "bg-teal-700 px-3 py-2 text-white"
const AGUARDANDO_COLOR_CLASS = "text-[#0055A4]"

function formatDataBR(iso: string): string {
  const [, mes, dia] = iso.split("-")
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
// AvisosMapaService local — fetch direto até o client ser regenerado
// ---------------------------------------------------------------------------

type AvisoMapaPublic = {
  id: string
  texto: string
  animacao_interna: string
  transicao_saida: string
  duracao_segundos: number
  cor_fundo: string
  ordem: number
  ativo: boolean
  updated_at: string
}

async function fetchAvisosAtivos(): Promise<{ data: AvisoMapaPublic[]; count: number }> {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null
  const base = OpenAPI.BASE ?? ""
  const res = await fetch(`${base}/api/v1/avisos-mapa/ativos`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) return { data: [], count: 0 }
  return res.json()
}

async function fetchAvisosTodos(): Promise<{ data: AvisoMapaPublic[]; count: number }> {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null
  const base = OpenAPI.BASE ?? ""
  const res = await fetch(`${base}/api/v1/avisos-mapa/`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) return { data: [], count: 0 }
  return res.json()
}

// ---------------------------------------------------------------------------
// Animações
// ---------------------------------------------------------------------------

const TRANS_CSS: Record<string, string> = {
  fade: "fadeInPlayer 0.5s ease both",
  slide_esquerda: "slideInLPlayer 0.45s ease both",
  slide_direita: "slideInRPlayer 0.45s ease both",
  zoom_out: "zoomInPlayer 0.45s ease both",
  wipe_down: "wipePlayer 0.5s ease both",
  nenhuma: "",
}

const ANIM_CSS: Record<string, string> = {
  fade_up: "fadeUpPlayer 0.6s ease both",
  zoom: "zoomInPlayer 0.5s cubic-bezier(0.34,1.56,0.64,1) both",
  letreiro: "tickerPlayer 8s linear infinite",
  estatico: "",
  pulso_fundo: "",
}

function injetarKeyframes() {
  if (document.getElementById("player-avisos-keyframes")) return
  const style = document.createElement("style")
  style.id = "player-avisos-keyframes"
  style.textContent = `
    @keyframes fadeInPlayer { from { opacity:0; } to { opacity:1; } }
    @keyframes fadeUpPlayer { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
    @keyframes slideInLPlayer { from { opacity:0; transform:translateX(40px); } to { opacity:1; transform:translateX(0); } }
    @keyframes slideInRPlayer { from { opacity:0; transform:translateX(-40px); } to { opacity:1; transform:translateX(0); } }
    @keyframes zoomInPlayer { from { opacity:0; transform:scale(0.85); } to { opacity:1; transform:scale(1); } }
    @keyframes wipePlayer { from { clip-path:inset(0 100% 0 0); } to { clip-path:inset(0 0% 0 0); } }
    @keyframes tickerPlayer { from { transform:translateX(110%); } to { transform:translateX(-110%); } }
    @keyframes pulsoBgPlayer { 0%,100% { filter:brightness(1); } 50% { filter:brightness(1.45); } }
  `
  document.head.appendChild(style)
}

// ---------------------------------------------------------------------------
// Bloco 1 — PlayerAvisos
// ---------------------------------------------------------------------------

function PlayerAvisos() {
  const { data } = useQuery({
    queryKey: ["avisosMapaAtivos"],
    queryFn: fetchAvisosAtivos,
    refetchInterval: POLLING_AVISOS_MS,
  })

  const avisos: AvisoMapaPublic[] = data?.data ?? []
  const idxRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const progStartRef = useRef(0)

  const [display, setDisplay] = useState<{
    texto: string
    corFundo: string
    animInterna: string
    transEntrada: string
    pulso: boolean
    letreiro: boolean
  } | null>(null)

  const [progPct, setProgPct] = useState(0)

  const mostrarSlide = useCallback(
    (idx: number, transEntrada: string, slides: AvisoMapaPublic[]) => {
      if (!slides.length) return
      const s = slides[idx]
      setDisplay({
        texto: s.texto,
        corFundo: s.cor_fundo,
        animInterna: s.animacao_interna,
        transEntrada,
        pulso: s.animacao_interna === "pulso_fundo",
        letreiro: s.animacao_interna === "letreiro",
      })
    },
    [],
  )

  const iniciarProg = useCallback((dur: number) => {
    if (progTimerRef.current) clearInterval(progTimerRef.current)
    progStartRef.current = Date.now()
    setProgPct(0)
    progTimerRef.current = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - progStartRef.current) / (dur * 1000)) * 100)
      setProgPct(pct)
      if (pct >= 100 && progTimerRef.current) clearInterval(progTimerRef.current)
    }, 100)
  }, [])

  const agendarProximo = useCallback(
    (slides: AvisoMapaPublic[]) => {
      if (!slides.length) return
      const s = slides[idxRef.current]
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        const trans = s.transicao_saida
        idxRef.current = (idxRef.current + 1) % slides.length
        mostrarSlide(idxRef.current, trans, slides)
        iniciarProg(slides[idxRef.current].duracao_segundos)
        agendarProximo(slides)
      }, s.duracao_segundos * 1000)
    },
    [mostrarSlide, iniciarProg],
  )

  useEffect(() => {
    injetarKeyframes()
    if (!avisos.length) {
      setDisplay(null)
      return
    }
    if (idxRef.current >= avisos.length) idxRef.current = 0
    mostrarSlide(idxRef.current, "", avisos)
    iniciarProg(avisos[idxRef.current].duracao_segundos)
    agendarProximo(avisos)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (progTimerRef.current) clearInterval(progTimerRef.current)
    }
  }, [avisos.map((a) => a.id + a.updated_at).join(",")]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!display) {
    return (
      <div className="flex h-28 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs text-slate-400">
        Nenhum aviso configurado
      </div>
    )
  }

  const msgAnim =
    display.letreiro
      ? ANIM_CSS.letreiro
      : TRANS_CSS[display.transEntrada] || ANIM_CSS[display.animInterna] || ""

  return (
    <div
      className="relative flex h-28 shrink-0 items-center justify-center overflow-hidden rounded-lg"
      style={{
        background: display.corFundo,
        animation: display.pulso ? "pulsoBgPlayer 2s ease-in-out infinite" : undefined,
      }}
    >
      <p
        className="px-4 text-center text-base font-semibold leading-snug"
        style={{
          color: "#f1f5f9",
          textShadow: "0 1px 3px rgba(0,0,0,0.4)",
          animation: msgAnim || undefined,
          whiteSpace: display.letreiro ? "nowrap" : undefined,
        }}
      >
        {display.texto}
      </p>
      <div
        className="absolute bottom-0 left-0 h-[3px]"
        style={{
          width: `${progPct}%`,
          background: "rgba(255,255,255,0.45)",
          transition: "width 0.1s linear",
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bloco 2 — Ranking da Semana
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
// Bloco 3 — Chamadas hoje
// ---------------------------------------------------------------------------

function ChamadaAtivaRow({ demanda }: { demanda: DemandaVendaPublic }) {
  const aguardandoAceite = demanda.status === "pendente"
  const statusText = aguardandoAceite
    ? demanda.motorista_nome
      ? `Aguardando ${demanda.motorista_nome} aceitar...`
      : "Aberto -- aguardando aceite"
    : null

  return (
    <div className="flex items-center gap-2 rounded-md bg-slate-50 p-2">
      <div className="flex w-14 shrink-0 flex-col items-center gap-0.5">
        {aguardandoAceite ? (
          <div className="flex h-8 w-8 items-center justify-center">
            <Loader2 className={`h-6 w-6 animate-spin ${AGUARDANDO_COLOR_CLASS}`} />
          </div>
        ) : (
          <>
            <img src="/images/motorista-pendente.png" alt="" className="h-8 w-8 object-contain" />
            <p className="w-full truncate text-center text-[10px] leading-tight text-slate-600">
              {demanda.motorista_nome}
            </p>
          </>
        )}
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
      <img src="/images/produto-gas.png" alt="" className="h-8 w-8 shrink-0 object-contain" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{demanda.cliente_nome}</p>
        <p className="truncate text-xs text-slate-500">{formatEnderecoCurto(demanda)}</p>
        {statusText && (
          <p className={`truncate text-xs font-medium ${AGUARDANDO_COLOR_CLASS}`}>{statusText}</p>
        )}
      </div>
    </div>
  )
}

function ChamadaConcluidaRow({ demanda }: { demanda: DemandaVendaPublic }) {
  return (
    <div className="flex items-center gap-2 rounded-md p-2 opacity-80">
      <img src="/images/motorista-concluido.png" alt="" className="h-8 w-8 shrink-0 object-contain" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{demanda.cliente_nome}</p>
        <p className="truncate text-xs text-slate-500">{formatEnderecoCurto(demanda)}</p>
        {demanda.finalizada_em && (
          <p className="text-xs text-red-600">Atendida às {formatHoraBR(demanda.finalizada_em)} h</p>
        )}
      </div>
    </div>
  )
}

function prioridadeAtiva(demanda: DemandaVendaPublic): number {
  return demanda.status === "pendente" ? 0 : 1
}

function ChamadasHoje() {
  const { data } = useQuery({
    queryKey: ["demandasHoje"],
    queryFn: () => DelegacaoService.readDemandasHoje(),
    refetchInterval: POLLING_CHAMADAS_MS,
  })

  const todas = data?.data ?? []
  const ativas = todas
    .filter((d) => d.status === "pendente" || d.status === "aceita")
    .sort((a, b) => prioridadeAtiva(a) - prioridadeAtiva(b))
  const concluidas = todas
    .filter((d) => d.status === "concluida")
    .sort((a, b) => (b.finalizada_em ?? "").localeCompare(a.finalizada_em ?? ""))

  const hojeLabel = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className={`shrink-0 ${HEADER_CLASS}`}>
        <p className="text-sm font-semibold">Chamadas hoje ({hojeLabel})</p>
      </div>
      <div className="flex-1 overflow-y-auto bg-white p-2">
        <div className="flex flex-col gap-2">
          {ativas.map((d) => <ChamadaAtivaRow key={d.id} demanda={d} />)}
          {concluidas.map((d) => <ChamadaConcluidaRow key={d.id} demanda={d} />)}
          {ativas.length === 0 && concluidas.length === 0 && (
            <p className="p-4 text-center text-xs text-slate-400">Nenhum chamado hoje ainda</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { fetchAvisosAtivos, fetchAvisosTodos }
export type { AvisoMapaPublic }

export function PainelLateral() {
  return (
    <div className="flex h-full w-[340px] shrink-0 flex-col gap-3">
      <PlayerAvisos />
      <RankingSemana />
      <ChamadasHoje />
    </div>
  )
}

export default PainelLateral
