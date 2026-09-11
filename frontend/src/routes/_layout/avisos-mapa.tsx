// [mcp-local harness] feature: avisos-mapa-pagina | plano: 68dba915 | 2026-09-11 20:25:02
// Nova página /avisos-mapa — configuração completa com preview, lista de slides, CRUD e reordenação
// Página /avisos-mapa — configuração dos slides de avisos exibidos na TV
// Acesso via RBAC módulo "mapa" (mesma permissão do mapa)
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Plus, Trash2 } from "lucide-react"
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

// ---------------------------------------------------------------------------
// Fetch helpers (fetch direto até AvisosMapaService ser gerado no client)
// ---------------------------------------------------------------------------

function getToken(): string | null {
  try { return localStorage.getItem("access_token") } catch { return null }
}

function apiBase(): string { return OpenAPI.BASE ?? "" }

async function fetchAvisosTodos(): Promise<{ data: AvisoMapaPublic[]; count: number }> {
  const res = await fetch(`${apiBase()}/api/v1/avisos-mapa/`, {
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
  })
  if (!res.ok) return { data: [], count: 0 }
  return res.json()
}

async function criarAviso(body: Partial<AvisoMapaPublic>): Promise<AvisoMapaPublic> {
  const res = await fetch(`${apiBase()}/api/v1/avisos-mapa/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function atualizarAviso(id: string, patch: Partial<AvisoMapaPublic>): Promise<AvisoMapaPublic> {
  const res = await fetch(`${apiBase()}/api/v1/avisos-mapa/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: JSON.stringify(patch),
  })
  return res.json()
}

async function removerAviso(id: string): Promise<void> {
  await fetch(`${apiBase()}/api/v1/avisos-mapa/${id}`, {
    method: "DELETE",
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
  })
}

async function reordenarAvisos(ids: string[]): Promise<void> {
  await fetch(`${apiBase()}/api/v1/avisos-mapa/reordenar`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: JSON.stringify(ids),
  })
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const ANIMS = [
  { value: "estatico",    label: "Estático" },
  { value: "fade_up",     label: "Fade up" },
  { value: "zoom",        label: "Zoom" },
  { value: "letreiro",    label: "Letreiro" },
  { value: "pulso_fundo", label: "Pulso fundo" },
]

const TRANS = [
  { value: "fade",          label: "Fade" },
  { value: "slide_esquerda", label: "Slide esquerda" },
  { value: "slide_direita",  label: "Slide direita" },
  { value: "zoom_out",       label: "Zoom out" },
  { value: "wipe_down",      label: "Wipe down" },
  { value: "nenhuma",        label: "Nenhuma" },
]

const ANIM_CSS_PREV: Record<string, string> = {
  fade_up:     "fadeUpPrevAM 0.6s ease both",
  zoom:        "zoomInPrevAM 0.5s cubic-bezier(0.34,1.56,0.64,1) both",
  letreiro:    "tickerPrevAM 8s linear infinite",
  estatico:    "",
  pulso_fundo: "",
}

function injetarKeyframesPrev() {
  if (document.getElementById("prev-avisos-am-kf")) return
  const s = document.createElement("style")
  s.id = "prev-avisos-am-kf"
  s.textContent = `
    @keyframes fadeUpPrevAM  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
    @keyframes zoomInPrevAM  { from{opacity:0;transform:scale(0.85)} to{opacity:1;transform:scale(1)} }
    @keyframes tickerPrevAM  { from{transform:translateX(110%)} to{transform:translateX(-110%)} }
    @keyframes pulsoPrevAM   { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.45)} }
  `
  document.head.appendChild(s)
}

// ---------------------------------------------------------------------------
// Preview — mesmo quadro que aparece na TV
// ---------------------------------------------------------------------------

function PreviewPlayer({ avisos, idxAtivo }: { avisos: AvisoMapaPublic[]; idxAtivo: number }) {
  useEffect(() => { injetarKeyframesPrev() }, [])

  if (!avisos.length) {
    return (
      <div className="flex h-36 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-sm text-slate-400">
        Nenhum slide ainda — adicione um abaixo
      </div>
    )
  }

  const s = avisos[Math.min(idxAtivo, avisos.length - 1)]
  const pulso   = s.animacao_interna === "pulso_fundo"
  const letreiro = s.animacao_interna === "letreiro"
  const msgAnim = letreiro ? ANIM_CSS_PREV.letreiro : ANIM_CSS_PREV[s.animacao_interna] || ""

  return (
    <div
      className="relative flex h-36 items-center justify-center overflow-hidden rounded-xl"
      style={{
        background: s.cor_fundo,
        animation: pulso ? "pulsoPrevAM 2s ease-in-out infinite" : undefined,
      }}
    >
      <p
        className="px-8 text-center text-lg font-semibold leading-snug"
        style={{
          color: "#f1f5f9",
          textShadow: "0 1px 3px rgba(0,0,0,0.4)",
          animation: msgAnim || undefined,
          whiteSpace: letreiro ? "nowrap" : undefined,
        }}
      >
        {s.texto}
      </p>
      <div className="absolute bottom-2 right-3 text-[11px] text-white/50">
        slide {Math.min(idxAtivo, avisos.length - 1) + 1} de {avisos.length} · {s.duracao_segundos}s
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

function AvisosMapaPage() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ["avisosMapaTodos"], queryFn: fetchAvisosTodos })

  const avisos: AvisoMapaPublic[] = (data?.data ?? []).slice().sort((a, b) => a.ordem - b.ordem)
  const [idxAtivo, setIdxAtivo] = useState(0)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["avisosMapaTodos"] })
    qc.invalidateQueries({ queryKey: ["avisosMapaAtivos"] })
  }

  const criar = useMutation({
    mutationFn: () => criarAviso({ texto: "Novo aviso", animacao_interna: "fade_up", transicao_saida: "fade", duracao_segundos: 6, cor_fundo: "#1e293b", ordem: avisos.length, ativo: true }),
    onSuccess: () => { invalidate(); setIdxAtivo(avisos.length) },
  })

  const atualizar = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<AvisoMapaPublic> }) => atualizarAviso(id, patch),
    onSuccess: invalidate,
  })

  const remover = useMutation({
    mutationFn: (id: string) => removerAviso(id),
    onSuccess: () => { invalidate(); setIdxAtivo(0) },
  })

  const reordenar = useMutation({
    mutationFn: (ids: string[]) => reordenarAvisos(ids),
    onSuccess: invalidate,
  })

  const moverSlide = (idx: number, dir: -1 | 1) => {
    const nova = [...avisos]
    const alvo = idx + dir
    if (alvo < 0 || alvo >= nova.length) return
    ;[nova[idx], nova[alvo]] = [nova[alvo], nova[idx]]
    reordenar.mutate(nova.map((a) => a.id))
    setIdxAtivo(alvo)
  }

  const inputCls  = "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-teal-500 focus:outline-none dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100"
  const selectCls = "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-teal-500 focus:outline-none dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100"

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Avisos do mapa</h1>
        <p className="text-muted-foreground">
          Configure os slides exibidos no painel lateral da TV.
        </p>
      </div>

      {/* Preview — mesmo quadro da TV */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Preview — quadro da TV
        </p>
        <PreviewPlayer avisos={avisos} idxAtivo={Math.min(idxAtivo, Math.max(0, avisos.length - 1))} />
        {avisos.length > 1 && (
          <div className="flex gap-1.5 justify-center mt-1">
            {avisos.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIdxAtivo(i)}
                className={cn("h-2 w-2 rounded-full transition-colors", i === Math.min(idxAtivo, avisos.length - 1) ? "bg-teal-600" : "bg-slate-300")}
              />
            ))}
          </div>
        )}
      </div>

      {/* Lista de slides */}
      <div className="flex flex-col gap-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Slides ({avisos.length})
        </p>

        {avisos.map((aviso, idx) => (
          <div key={aviso.id}>
            {idx > 0 && (
              <div className="mb-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="rounded-full bg-teal-50 px-3 py-0.5 text-xs font-medium text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                  ↓ transição: {TRANS.find((t) => t.value === avisos[idx - 1].transicao_saida)?.label}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}

            <div
              className={cn(
                "rounded-2xl border bg-card p-5 cursor-pointer transition-all",
                idxAtivo === idx ? "border-teal-500 ring-1 ring-teal-500/30" : "border-border hover:border-border-strong",
              )}
              onClick={() => setIdxAtivo(idx)}
            >
              {/* Cabeçalho */}
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                  {idx + 1}
                </span>
                <span className="flex-1 text-sm font-medium text-muted-foreground">
                  {aviso.ativo ? "Visível na TV" : "Oculto"}
                </span>
                <div className="flex items-center gap-1 ml-auto">
                  <button type="button" onClick={(e) => { e.stopPropagation(); moverSlide(idx, -1) }} disabled={idx === 0} className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-30">↑</button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); moverSlide(idx, 1) }} disabled={idx === avisos.length - 1} className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-30">↓</button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); if (avisos.length === 1) return; remover.mutate(aviso.id) }}
                    disabled={avisos.length === 1}
                    className="ml-2 rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                    title="Remover slide"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Texto */}
              <textarea
                className={`${inputCls} mb-4 w-full resize-none`}
                rows={2}
                defaultValue={aviso.texto}
                placeholder="Texto do aviso..."
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  const val = e.target.value.trim()
                  if (val && val !== aviso.texto) atualizar.mutate({ id: aviso.id, patch: { texto: val } })
                }}
              />

              {/* Controles em grid */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Animação interna</span>
                  <select className={selectCls} defaultValue={aviso.animacao_interna} onClick={(e) => e.stopPropagation()} onChange={(e) => atualizar.mutate({ id: aviso.id, patch: { animacao_interna: e.target.value } })}>
                    {ANIMS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Transição de saída</span>
                  <select className={selectCls} defaultValue={aviso.transicao_saida} onClick={(e) => e.stopPropagation()} onChange={(e) => atualizar.mutate({ id: aviso.id, patch: { transicao_saida: e.target.value } })}>
                    {TRANS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Duração</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="range" min={3} max={30} step={1}
                      defaultValue={aviso.duracao_segundos}
                      className="flex-1"
                      onClick={(e) => e.stopPropagation()}
                      onMouseUp={(e) => atualizar.mutate({ id: aviso.id, patch: { duracao_segundos: parseInt((e.target as HTMLInputElement).value) } })}
                    />
                    <span className="min-w-[32px] text-sm font-semibold">{aviso.duracao_segundos}s</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Cor do fundo</span>
                  <div className="flex items-center gap-2">
                    <div
                      className="relative h-8 w-8 cursor-pointer overflow-hidden rounded-lg border border-slate-300"
                      style={{ background: aviso.cor_fundo }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="color"
                        defaultValue={aviso.cor_fundo}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        onInput={(e) => { (e.target as HTMLInputElement).parentElement!.style.background = (e.target as HTMLInputElement).value }}
                        onChange={(e) => atualizar.mutate({ id: aviso.id, patch: { cor_fundo: e.target.value } })}
                      />
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">{aviso.cor_fundo.toUpperCase()}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Visível na TV</span>
                  <label className="flex cursor-pointer items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      defaultChecked={aviso.ativo}
                      className="h-4 w-4 accent-teal-600"
                      onChange={(e) => atualizar.mutate({ id: aviso.id, patch: { ativo: e.target.checked } })}
                    />
                    <span className="text-sm">{aviso.ativo ? "Ativo" : "Inativo"}</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        className="w-full gap-2 border-dashed"
        onClick={() => criar.mutate()}
        disabled={criar.isPending}
      >
        <Plus className="h-4 w-4" />
        Adicionar slide
      </Button>
    </div>
  )
}
