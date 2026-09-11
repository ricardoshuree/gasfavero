// [mcp-local harness] feature: mapa-motorista-status | plano: d4714bf5 | 2026-09-11 17:32:47
// 4 imagens on/off × direita/esquerda, bolinha verde/cinza no nome, polling 3s, threshold inativo 2min
// Componente do mapa com polling de localização dos motoristas +
// pins de destino dos chamados ativos (pendente/aceita) de hoje.
//
// Imagens de caminhão (4 variantes em /images/):
//   caminhao-motorista_on_frente_direita.png   — ativo, movendo para direita
//   caminhao-motorista_on_frente_esquerda.png  — ativo, movendo para esquerda
//   caminhao-motorista_off_frente_direita.png  — inativo, última direção = direita
//   caminhao-motorista_off_frente_esquerda.png — inativo, última direção = esquerda
//
// Ativo = atualizado_em há menos de 120s (threshold 2 minutos).
// Direção = comparação longitude atual vs anterior; sem histórico = direita (default).
// Bolinha verde (#22c55e) ou cinza (#94a3b8) ao final do nome conforme estado.
// Polling a cada 3s.
import { useQuery } from "@tanstack/react-query"
import { useEffect, useRef } from "react"

import { DelegacaoService } from "@/client"
import { useGoogleMapsScript } from "@/hooks/useGoogleMapsScript"

const CENTRO_VERANOPOLIS: google.maps.LatLngLiteral = {
  lat: -28.9339,
  lng: -51.5528,
}

const POLLING_MS = 3_000
const INATIVO_THRESHOLD_MS = 120_000 // 2 minutos
const ICONE_SIZE_PX = 56

// Seleciona a imagem correta baseado em estado e direção
function resolverIconeSrc(ativo: boolean, paráDireita: boolean): string {
  const estado = ativo ? "on" : "off"
  const direcao = paráDireita ? "direita" : "esquerda"
  return `/images/caminhao-motorista_${estado}_frente_${direcao}.png`
}

function isAtivo(atualizadoEm: string): boolean {
  return Date.now() - new Date(atualizadoEm).getTime() < INATIVO_THRESHOLD_MS
}

function formatarAtualizadoEm(atualizadoEm: string): string {
  const segundos = Math.floor(
    (Date.now() - new Date(atualizadoEm).getTime()) / 1000,
  )
  if (segundos < 60) return `há ${segundos}s`
  const minutos = Math.floor(segundos / 60)
  if (minutos < 60) return `há ${minutos}min`
  const horas = Math.floor(minutos / 60)
  return `há ${horas}h`
}

// ---------------------------------------------------------------------------
// MotoristaOverlay — OverlayView com ícone + legenda (nome + bolinha)
// ---------------------------------------------------------------------------

interface MotoristaOverlayInstance extends google.maps.OverlayView {
  setPosition(position: google.maps.LatLngLiteral): void
  setEstado(nome: string, ativo: boolean, paraDireita: boolean): void
}

type MotoristaOverlayCtor = new (
  position: google.maps.LatLngLiteral,
  nome: string,
  ativo: boolean,
  paraDireita: boolean,
  onClick: () => void,
) => MotoristaOverlayInstance

let motoristaOverlayCtor: MotoristaOverlayCtor | null = null

function getMotoristaOverlayCtor(): MotoristaOverlayCtor {
  if (motoristaOverlayCtor) return motoristaOverlayCtor

  class MotoristaOverlay
    extends window.google!.maps.OverlayView
    implements MotoristaOverlayInstance
  {
    private position: google.maps.LatLngLiteral
    private nome: string
    private ativo: boolean
    private paraDireita: boolean
    private onClickHandler: () => void
    private div: HTMLDivElement | null = null
    private img: HTMLImageElement | null = null
    private bolinha: HTMLSpanElement | null = null

    constructor(
      position: google.maps.LatLngLiteral,
      nome: string,
      ativo: boolean,
      paraDireita: boolean,
      onClick: () => void,
    ) {
      super()
      this.position = position
      this.nome = nome
      this.ativo = ativo
      this.paraDireita = paraDireita
      this.onClickHandler = onClick
    }

    onAdd() {
      const div = document.createElement("div")
      div.style.position = "absolute"
      div.style.transform = "translate(-50%, -100%)"
      div.style.display = "flex"
      div.style.flexDirection = "column"
      div.style.alignItems = "center"
      div.style.cursor = "pointer"
      div.style.pointerEvents = "auto"
      div.style.userSelect = "none"

      const img = document.createElement("img")
      img.src = resolverIconeSrc(this.ativo, this.paraDireita)
      img.style.width = `${ICONE_SIZE_PX}px`
      img.style.height = `${ICONE_SIZE_PX}px`
      img.style.display = "block"
      img.draggable = false

      // Legenda: [nome] [●]
      const caption = document.createElement("div")
      caption.style.marginTop = "2px"
      caption.style.padding = "1px 6px"
      caption.style.borderRadius = "4px"
      caption.style.background = "#ffffff"
      caption.style.color = "#0f172a"
      caption.style.fontSize = "11px"
      caption.style.fontWeight = "600"
      caption.style.whiteSpace = "nowrap"
      caption.style.boxShadow = "0 1px 3px rgba(0,0,0,0.35)"
      caption.style.display = "flex"
      caption.style.alignItems = "center"
      caption.style.gap = "4px"

      const nomeSpan = document.createElement("span")
      nomeSpan.textContent = this.nome

      const bolinha = document.createElement("span")
      bolinha.style.width = "8px"
      bolinha.style.height = "8px"
      bolinha.style.borderRadius = "50%"
      bolinha.style.display = "inline-block"
      bolinha.style.flexShrink = "0"
      bolinha.style.backgroundColor = this.ativo ? "#22c55e" : "#94a3b8"

      caption.appendChild(nomeSpan)
      caption.appendChild(bolinha)

      div.appendChild(img)
      div.appendChild(caption)
      div.addEventListener("click", () => this.onClickHandler())

      this.div = div
      this.img = img
      this.bolinha = bolinha
      this.getPanes()?.overlayMouseTarget.appendChild(div)
    }

    draw() {
      if (!this.div) return
      const point = this.getProjection().fromLatLngToDivPixel(this.position)
      if (point) {
        this.div.style.left = `${point.x}px`
        this.div.style.top = `${point.y}px`
      }
    }

    onRemove() {
      this.div?.remove()
      this.div = null
      this.img = null
      this.bolinha = null
    }

    setPosition(position: google.maps.LatLngLiteral) {
      this.position = position
      this.draw()
    }

    setEstado(nome: string, ativo: boolean, paraDireita: boolean) {
      this.nome = nome
      this.ativo = ativo
      this.paraDireita = paraDireita

      if (this.img) {
        this.img.src = resolverIconeSrc(ativo, paraDireita)
      }
      if (this.bolinha) {
        this.bolinha.style.backgroundColor = ativo ? "#22c55e" : "#94a3b8"
      }
      // Atualiza o nome no caption (primeiro filho do caption div)
      const caption = this.div?.querySelector("div")
      if (caption) {
        const nomeSpan = caption.querySelector("span")
        if (nomeSpan) nomeSpan.textContent = nome
      }
    }
  }

  motoristaOverlayCtor = MotoristaOverlay
  return motoristaOverlayCtor
}

// ---------------------------------------------------------------------------

interface MapaMotoristasProps {
  className?: string
}

export function MapaMotoristas({
  className = "h-full w-full",
}: MapaMotoristasProps) {
  const { loaded, error: scriptError } = useGoogleMapsScript()
  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const overlaysRef = useRef<globalThis.Map<string, MotoristaOverlayInstance>>(
    new globalThis.Map(),
  )
  const destinoMarkersRef = useRef<globalThis.Map<string, google.maps.Marker>>(
    new globalThis.Map(),
  )
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null)

  // Guarda a última longitude conhecida por motorista para calcular direção
  const ultimaLongRef = useRef<globalThis.Map<string, number>>(
    new globalThis.Map(),
  )

  const {
    data,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: ["localizacoesMotoristas"],
    queryFn: () => DelegacaoService.readLocalizacoesMotoristas(),
    refetchInterval: POLLING_MS,
    enabled: loaded,
  })

  const { data: demandasHoje } = useQuery({
    queryKey: ["demandasHoje"],
    queryFn: () => DelegacaoService.readDemandasHoje(),
    refetchInterval: POLLING_MS,
    enabled: loaded,
  })

  useEffect(() => {
    if (!loaded || !mapDivRef.current || mapRef.current || !window.google) {
      return
    }
    mapRef.current = new window.google.maps.Map(mapDivRef.current, {
      center: CENTRO_VERANOPOLIS,
      zoom: 14,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    })
    infoWindowRef.current = new window.google.maps.InfoWindow()
  }, [loaded])

  useEffect(() => {
    if (!mapRef.current || !data || !window.google) return

    const idsAtuais = new Set(data.data.map((m) => m.motorista_id))

    // Remove overlays de motoristas que saíram da lista
    for (const [id, overlay] of overlaysRef.current) {
      if (!idsAtuais.has(id)) {
        overlay.setMap(null)
        overlaysRef.current.delete(id)
        ultimaLongRef.current.delete(id)
      }
    }

    for (const motorista of data.data) {
      const position: google.maps.LatLngLiteral = {
        lat: Number(motorista.latitude),
        lng: Number(motorista.longitude),
      }
      const lngAtual = Number(motorista.longitude)
      const lngAnterior = ultimaLongRef.current.get(motorista.motorista_id)

      // Direção: compara com última longitude conhecida; sem histórico = direita
      const paraDireita =
        lngAnterior === undefined ? true : lngAtual >= lngAnterior

      // Atualiza histórico de longitude
      ultimaLongRef.current.set(motorista.motorista_id, lngAtual)

      const ativo = isAtivo(motorista.atualizado_em)
      const existente = overlaysRef.current.get(motorista.motorista_id)

      if (existente) {
        existente.setPosition(position)
        existente.setEstado(motorista.motorista_nome, ativo, paraDireita)
      } else {
        const OverlayCtor = getMotoristaOverlayCtor()
        const overlay = new OverlayCtor(
          position,
          motorista.motorista_nome,
          ativo,
          paraDireita,
          () => {
            infoWindowRef.current?.setContent(
              `<div style="color:#0f172a"><strong>${motorista.motorista_nome}</strong><br/>Atualizado ${formatarAtualizadoEm(motorista.atualizado_em)}</div>`,
            )
            infoWindowRef.current?.setPosition(position)
            infoWindowRef.current?.open(mapRef.current ?? undefined)
          },
        )
        overlay.setMap(mapRef.current)
        overlaysRef.current.set(motorista.motorista_id, overlay)
      }
    }
  }, [data])

  useEffect(() => {
    if (!mapRef.current || !demandasHoje || !window.google) return

    const ativas = demandasHoje.data.filter(
      (d) => d.status === "pendente" || d.status === "aceita",
    )
    const idsAtivos = new Set(ativas.map((d) => d.id))

    for (const [id, marker] of destinoMarkersRef.current) {
      if (!idsAtivos.has(id)) {
        marker.setMap(null)
        destinoMarkersRef.current.delete(id)
      }
    }

    for (const demanda of ativas) {
      if (!demanda.endereco.latitude || !demanda.endereco.longitude) continue

      const position: google.maps.LatLngLiteral = {
        lat: Number(demanda.endereco.latitude),
        lng: Number(demanda.endereco.longitude),
      }
      const existente = destinoMarkersRef.current.get(demanda.id)

      if (existente) {
        existente.setPosition(position)
      } else {
        const marker = new window.google.maps.Marker({
          position,
          map: mapRef.current,
          title: demanda.cliente_nome,
        })
        marker.addListener("click", () => {
          const quemAceitou = demanda.motorista_nome
            ? `Motorista: ${demanda.motorista_nome}`
            : "Aberto — qualquer motorista"
          infoWindowRef.current?.setContent(
            `<div style="color:#0f172a"><strong>${demanda.cliente_nome}</strong><br/>${demanda.endereco.rua_nome}, ${demanda.endereco.numero}<br/>${quemAceitou}</div>`,
          )
          infoWindowRef.current?.open(mapRef.current ?? undefined, marker)
        })
        destinoMarkersRef.current.set(demanda.id, marker)
      }
    }
  }, [demandasHoje])

  if (scriptError) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        {scriptError}. Confirme VITE_GOOGLE_MAPS_API_KEY no frontend/.env.
      </div>
    )
  }

  if (queryError) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        Não foi possível carregar as localizações dos motoristas.
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      <div
        ref={mapDivRef}
        className={`rounded-md border ${className}`}
        aria-label="Mapa com a localização dos motoristas"
      />
      {!isLoading && data?.data.length === 0 && (
        <p className="absolute bottom-2 left-2 rounded bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow">
          Nenhum motorista com localização registrada ainda.
        </p>
      )}
    </div>
  )
}

export default MapaMotoristas
