// [mcp-local harness] feature: letreiro-multiline | plano: 73842985 | 2026-09-11 20:59:55
// v4: letreiro white-space pre (multi-linha), remove aviso amarelo, Enter funciona em todos os modos
// Página /avisos-mapa — configuração dos slides de avisos exibidos na TV
// v4: letreiro multi-linha (white-space: pre), Enter quebra linha em todos os modos
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Eye, Plus, Save, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"

import { UsersService } from "@/client"
import { OpenAPI } from "@/client/core/OpenAPI"
import { type AvisoMapaPublic } from "@/components/Mapa/PainelLateral"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const MODULE = "mapa"

export const Route = createFileRoute("/_layout/avisos-mapa")({
  component: AvisosMapaPage,
  beforeLoad: async () => {
    const perms = await UsersService.readUserPermissions()
    const canRead =
      perms.is_superuser ||
      perms.permissions.some((p) => p.module === MODULE && p.can_read)
    if (!canRead) throw redirect({ to: "/" })
  },
  head: () => ({ meta: [{ title: "Avisos do Mapa - GasFavero" }] }),
})

function getToken(): string | null {
  try { return localStorage.getItem("access_token") } catch { return null }
}
function apiBase(): string { return OpenAPI.BASE ?? "" }
function authHeaders(): HeadersInit {
  return getToken()
    ? { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" }
}

async function fetchAvisosTodos(): Promise<{ data: AvisoMapaPublic[]; count: number }> {
  const res = await fetch(`${apiBase()}/api/v1/avisos-mapa/`, { headers: authHeaders() })
  if (!res.ok) return { data: [], count: 0 }
  return res.json()
}
async function criarAviso(body: Partial<AvisoMapaPublic>): Promise<AvisoMapaPublic> {
  const res = await fetch(`${apiBase()}/api/v1/avisos-mapa/`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) })
  return res.json()
}
async function atualizarAviso(id: string, patch: Partial<AvisoMapaPublic>): Promise<AvisoMapaPublic> {
  const res = await fetch(`${apiBase()}/api/v1/avisos-mapa/${id}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify(patch) })
  return res.json()
}
async function removerAviso(id: string): Promise<void> {
  await fetch(`${apiBase()}/api/v1/avisos-mapa/${id}`, { method: "DELETE", headers: authHeaders() })
}
async function reordenarAvisos(ids: string[]): Promise<void> {
  await fetch(`${apiBase()}/api/v1/avisos-mapa/reordenar`, { method: "PUT", headers: authHeaders(), body: JSON.stringify(ids) })
}

const ANIMS = [
  { value: "estatico",    label: "Estático" },
  { value: "fade_up",     label: "Fade up" },
  { value: "zoom",        label: "Zoom" },
  { value: "letreiro",    label: "Letreiro" },
  { value: "pulso_fundo", label: "Pulso fundo" },
]

const TRANS = [
  { value: "fade",           label: "Fade" },
  { value: "slide_esquerda", label: "Slide esquerda" },
  { value: "slide_direita",  label: "Slide direita" },
  { value: "zoom_out",       label: "Zoom out" },
  { value: "wipe_down",      label: "Wipe down" },
  { value: "nenhuma",        label: "Nenhuma" },
]

const ANIM_CSS: Record<string, string> = {
  fade_up:     "fadeUpAM 0.6s ease both",
  zoom:        "zoomInAM 0.5s cubic-bezier(0.34,1.56,0.64,1) both",
  letreiro:    "tickerAM 8s linear infinite",
  estatico:    "",
  pulso_fundo: "",
}

function injetarKeyframes() {
  if (document.getElementById("am-kf")) return
  const s = document.createElement("style")
  s.id = "am-kf"
  s.textContent = `
    @keyframes fadeUpAM  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
    @keyframes zoomInAM  { from{opacity:0;transform:scale(0.85)} to{opacity:1;transform:scale(1)} }
    @keyframes tickerAM  { from{transform:translateX(110%)} to{transform:translateX(-110%)} }
    @keyframes pulsoAM   { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.45)} }
  `
  document.head.appendChild(s)
}

type SlideLocal = {
  id: string
  texto: string
  animacao_interna: string
  transicao_saida: string
  duracao_segundos: number
  cor_fundo: string
  ativo: boolean
  ordem: number
  dirty: boolean
}

function toLocal(a: AvisoMapaPublic): SlideLocal {
  return { id: a.id, texto: a.texto, animacao_interna: a.animacao_interna, transicao_saida: a.transicao_saida, duracao_segundos: a.duracao_segundos, cor_fundo: a.cor_fundo, ativo: a.ativo, ordem: a.ordem, dirty: false }
}

// ---------------------------------------------------------------------------
// Preview — fiel ao que aparece na TV
// Letreiro: white-space "pre" — quebras mantidas, bloco desliza junto
// Demais:   white-space "pre-wrap" — quebras com wrap
// ---------------------------------------------------------------------------
function PreviewPlayer({ slide, idxLabel }: { slide: SlideLocal | null; idxLabel: string }) {
  useEffect(() => { injetarKeyframes() }, [])

  if (!slide) {
    return (
      <div className="flex h-36 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-sm text-slate-400">
        Nenhum slide ainda — adicione um abaixo
      </div>
    )
  }

  const isLetreiro = slide.animacao_interna === "letreiro"
  const isPulso    = slide.animacao_interna === "pulso_fundo"
  const msgAnim    = ANIM_CSS[slide.animacao_interna] || ""

  return (
    <div
      key={`${slide.id}-${slide.animacao_interna}-${slide.cor_fundo}`}
      className="relative flex h-36 items-center justify-center overflow-hidden rounded-xl transition-colors duration-300"
      style={{
        background: slide.cor_fundo,
        animation: isPulso ? "pulsoAM 2s ease-in-out infinite" : undefined,
      }}
    >
      <p
        key={`${slide.texto}-${slide.animacao_interna}`}
        className="px-8 text-center text-lg font-semibold leading-snug"
        style={{
          color: "#f1f5f9",
          textShadow: "0 1px 3px rgba(0,0,0,0.4)",
          animation: msgAnim || undefined,
          whiteSpace: isLetreiro ? "pre" : "pre-wrap",
        }}
      >
        {slide.texto}
      </p>
      <div className="absolute bottom-2 right-3 text-[11px] text-white/50">
        {idxLabel} · {slide.duracao_segundos}s
      </div>
    </div>
  )
}

function SlideCard({
  slide, idx, total, isAtivo, onChange, onSalvar, onRemover, onMover, onForcarPreview, salvando,
}: {
  slide: SlideLocal; idx: number; total: number; isAtivo: boolean
  onChange: (patch: Partial<SlideLocal>) => void
  onSalvar: () => void; onRemover: () => void
  onMover: (dir: -1 | 1) => void; onForcarPreview: () => void; salvando: boolean
}) {
  const selectCls = "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-teal-500 focus:outline-none dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 w-full"

  return (
    <div className={cn("rounded-2xl border bg-card p-5 transition-all", isAtivo ? "border-teal-500 ring-1 ring-teal-500/30" : "border-border hover:border-border-strong")}>
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">{idx + 1}</span>
        <span className="text-sm font-medium text-muted-foreground flex-1">
          {slide.ativo ? "Visível na TV" : "Oculto"}
          {slide.dirty && <span className="ml-2 text-amber-500 text-xs">● não salvo</span>}
        </span>
        <div className="flex items-center gap-1 ml-auto">
          <button type="button" onClick={onForcarPreview} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-teal-600" title="Ver no preview"><Eye className="h-4 w-4" /></button>
          <button type="button" onClick={() => onMover(-1)} disabled={idx === 0} className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-30">↑</button>
          <button type="button" onClick={() => onMover(1)} disabled={idx === total - 1} className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-30">↓</button>
          <button type="button" onClick={onRemover} disabled={total === 1} className="ml-2 rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30" title="Remover slide"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      <textarea
        className="mb-4 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-teal-500 focus:outline-none dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100"
        rows={3}
        value={slide.texto}
        placeholder="Texto do aviso... (Enter quebra linha)"
        onChange={(e) => onChange({ texto: e.target.value })}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 mb-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">Animação interna</span>
          <select className={selectCls} value={slide.animacao_interna} onChange={(e) => onChange({ animacao_interna: e.target.value })}>
            {ANIMS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">Transição de saída</span>
          <select className={selectCls} value={slide.transicao_saida} onChange={(e) => onChange({ transicao_saida: e.target.value })}>
            {TRANS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">Duração</span>
          <div className="flex items-center gap-2">
            <input type="range" min={3} max={30} step={1} value={slide.duracao_segundos} className="flex-1"
              onChange={(e) => onChange({ duracao_segundos: parseInt(e.target.value) })} />
            <span className="min-w-[32px] text-sm font-semibold">{slide.duracao_segundos}s</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">Cor do fundo</span>
          <div className="flex items-center gap-2">
            <div className="relative h-8 w-8 cursor-pointer overflow-hidden rounded-lg border border-slate-300 flex-shrink-0" style={{ background: slide.cor_fundo }}>
              <input type="color" value={slide.cor_fundo} className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                onChange={(e) => onChange({ cor_fundo: e.target.value })} />
            </div>
            <span className="font-mono text-xs text-muted-foreground">{slide.cor_fundo.toUpperCase()}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">Visível na TV</span>
          <label className="flex cursor-pointer items-center gap-2 pt-1">
            <input type="checkbox" checked={slide.ativo} className="h-4 w-4 accent-teal-600"
              onChange={(e) => onChange({ ativo: e.target.checked })} />
            <span className="text-sm">{slide.ativo ? "Ativo" : "Inativo"}</span>
          </label>
        </div>
      </div>

      <Button size="sm" variant={slide.dirty ? "default" : "outline"} className="gap-2"
        onClick={onSalvar} disabled={salvando || !slide.dirty}>
        <Save className="h-3.5 w-3.5" />
        {salvando ? "Salvando..." : slide.dirty ? "Salvar alterações" : "Salvo"}
      </Button>
    </div>
  )
}

function AvisosMapaPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ["avisosMapaTodos"], queryFn: fetchAvisosTodos })

  const [slides, setSlides] = useState<SlideLocal[]>([])
  const [idxAtivo, setIdxAtivo] = useState(0)
  const [salvandoId, setSalvandoId] = useState<string | null>(null)

  useEffect(() => {
    if (!data) return
    const remotos = data.data.slice().sort((a, b) => a.ordem - b.ordem)
    setSlides((prev) =>
      remotos.map((r) => {
        const local = prev.find((l) => l.id === r.id)
        return local?.dirty ? local : toLocal(r)
      })
    )
  }, [data])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["avisosMapaTodos"] })
    qc.invalidateQueries({ queryKey: ["avisosMapaAtivos"] })
  }

  const criar = useMutation({
    mutationFn: () => criarAviso({ texto: "Novo aviso", animacao_interna: "fade_up", transicao_saida: "fade", duracao_segundos: 6, cor_fundo: "#1e293b", ordem: slides.length, ativo: true }),
    onSuccess: (novo) => { setSlides((prev) => [...prev, toLocal(novo)]); setIdxAtivo(slides.length); invalidate() },
  })

  const remover = useMutation({
    mutationFn: (id: string) => removerAviso(id),
    onSuccess: (_, id) => { setSlides((prev) => prev.filter((s) => s.id !== id)); setIdxAtivo(0); invalidate() },
  })

  const reordenar = useMutation({
    mutationFn: (ids: string[]) => reordenarAvisos(ids),
    onSuccess: invalidate,
  })

  function onChange(id: string, patch: Partial<SlideLocal>) {
    setSlides((prev) => prev.map((s) => s.id === id ? { ...s, ...patch, dirty: true } : s))
    const idx = slides.findIndex((s) => s.id === id)
    if (idx >= 0 && idx !== idxAtivo) setIdxAtivo(idx)
  }

  async function onSalvar(id: string) {
    const slide = slides.find((s) => s.id === id)
    if (!slide) return
    setSalvandoId(id)
    try {
      await atualizarAviso(id, { texto: slide.texto, animacao_interna: slide.animacao_interna, transicao_saida: slide.transicao_saida, duracao_segundos: slide.duracao_segundos, cor_fundo: slide.cor_fundo, ativo: slide.ativo })
      setSlides((prev) => prev.map((s) => s.id === id ? { ...s, dirty: false } : s))
      invalidate()
    } finally { setSalvandoId(null) }
  }

  function onMover(idx: number, dir: -1 | 1) {
    const nova = [...slides]
    const alvo = idx + dir
    if (alvo < 0 || alvo >= nova.length) return
    ;[nova[idx], nova[alvo]] = [nova[alvo], nova[idx]]
    setSlides(nova)
    reordenar.mutate(nova.map((s) => s.id))
    setIdxAtivo(alvo)
  }

  const slideAtivo = slides[Math.min(idxAtivo, Math.max(0, slides.length - 1))] ?? null

  if (isLoading) return <div className="text-sm text-muted-foreground p-8">Carregando avisos...</div>

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Avisos do mapa</h1>
        <p className="text-muted-foreground">Configure os slides exibidos no painel lateral da TV.</p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview — quadro da TV</p>
        <PreviewPlayer slide={slideAtivo} idxLabel={slides.length > 0 ? `slide ${Math.min(idxAtivo, slides.length - 1) + 1} de ${slides.length}` : ""} />
        {slides.length > 1 && (
          <div className="flex gap-1.5 justify-center mt-1">
            {slides.map((_, i) => (
              <button key={i} type="button" onClick={() => setIdxAtivo(i)}
                className={cn("h-2 w-2 rounded-full transition-colors", i === Math.min(idxAtivo, slides.length - 1) ? "bg-teal-600" : "bg-slate-300")} />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Slides ({slides.length})</p>
        {slides.map((slide, idx) => (
          <div key={slide.id}>
            {idx > 0 && (
              <div className="mb-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="rounded-full bg-teal-50 px-3 py-0.5 text-xs font-medium text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                  ↓ transição: {TRANS.find((t) => t.value === slides[idx - 1].transicao_saida)?.label}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}
            <SlideCard
              slide={slide} idx={idx} total={slides.length} isAtivo={idxAtivo === idx}
              onChange={(patch) => onChange(slide.id, patch)}
              onSalvar={() => onSalvar(slide.id)}
              onRemover={() => remover.mutate(slide.id)}
              onMover={(dir) => onMover(idx, dir)}
              onForcarPreview={() => setIdxAtivo(idx)}
              salvando={salvandoId === slide.id}
            />
          </div>
        ))}
      </div>

      <Button variant="outline" className="w-full gap-2 border-dashed" onClick={() => criar.mutate()} disabled={criar.isPending}>
        <Plus className="h-4 w-4" />Adicionar slide
      </Button>
    </div>
  )
}
