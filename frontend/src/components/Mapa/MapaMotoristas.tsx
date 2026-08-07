// [mcp-local harness] feature: fonte-menor-nome-motorista | plano: a35ae2e9 | 2026-08-07 12:30:40
// Fonte do nome no mapa: 12px -> 11px
// Componente do mapa com polling de localizacao dos motoristas +
// pins de destino dos chamados ativos (pendente/aceita) de hoje.
import { useQuery } from "@tanstack/react-query"
import { useEffect, useRef } from "react"

import { DelegacaoService } from "@/client"
import { useGoogleMapsScript } from "@/hooks/useGoogleMapsScript"

// Centro padrão: Veranópolis/RS -- mesma cidade fixa usada na
// geocodificação (ver CIDADE_UF_PADRAO em
// backend/app/core/geocoding.py). Zoom 14 mostra a cidade inteira
// sem precisar dar zoom out manual.
const CENTRO_VERANOPOLIS: google.maps.LatLngLiteral = {
  lat: -28.9339,
  lng: -51.5528,
}

// Polling a cada 12s -- dentro da faixa combinada no plano da Fase 3
// (10-15s). Hoje os pontos só aparecem se alguém gravar via PUT
// /motoristas/{id}/localizacao manualmente (não existe app do
// motorista ainda, isso é Fase 4) -- mas o polling já fica pronto
// pra quando o app existir de verdade.
const POLLING_MS = 12_000

// Ícone customizado do marcador de motorista, fornecido pelo Ricardo
// -- ver frontend/public/images/. Tamanho em pixels ajustável aqui
// (era 40px, aumentado a pedido do Ricardo -- "parece bem pequeno").
const ICONE_MOTORISTA_SRC = "/images/caminhao-motorista.png"
const ICONE_MOTORISTA_SIZE_PX = 56

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
// Marcador customizado do motorista -- o Marker padrão do Google não
// suporta "ícone + texto sempre visível abaixo" (o `label` da API só
// aceita texto curto sobreposto ao ícone, não uma legenda separada
// embaixo). Um OverlayView desenha um <div> HTML de verdade (imagem +
// nome) ancorado na posição lat/lng, atualizado a cada pan/zoom via
// draw() -- é o jeito "correto" do Google Maps pra isso, mesmo dando
// mais código que um Marker simples.
//
// A classe só pode ser definida DEPOIS do script do Google carregar
// (precisa herdar de window.google.maps.OverlayView, que não existe
// antes disso) -- por isso a definição fica atrás de
// getMotoristaOverlayCtor(), memoizada em variável de módulo (só
// precisa existir 1 vez, não por instância do componente).
// ---------------------------------------------------------------------------

interface MotoristaOverlayInstance extends google.maps.OverlayView {
  setPosition(position: google.maps.LatLngLiteral): void
  setLabel(label: string): void
}

type MotoristaOverlayCtor = new (
  position: google.maps.LatLngLiteral,
  label: string,
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
    private label: string
    private onClickHandler: () => void
    private div: HTMLDivElement | null = null

    constructor(
      position: google.maps.LatLngLiteral,
      label: string,
      onClick: () => void,
    ) {
      super()
      this.position = position
      this.label = label
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
      img.src = ICONE_MOTORISTA_SRC
      img.style.width = `${ICONE_MOTORISTA_SIZE_PX}px`
      img.style.height = `${ICONE_MOTORISTA_SIZE_PX}px`
      img.style.display = "block"
      img.draggable = false

      const caption = document.createElement("span")
      caption.textContent = this.label
      caption.style.marginTop = "2px"
      caption.style.padding = "1px 6px"
      caption.style.borderRadius = "4px"
      caption.style.background = "#ffffff"
      caption.style.color = "#0f172a"
      caption.style.fontSize = "11px"
      caption.style.fontWeight = "600"
      caption.style.whiteSpace = "nowrap"
      caption.style.boxShadow = "0 1px 3px rgba(0,0,0,0.35)"

      div.appendChild(img)
      div.appendChild(caption)
      div.addEventListener("click", () => this.onClickHandler())

      this.div = div
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
    }

    setPosition(position: google.maps.LatLngLiteral) {
      this.position = position
      this.draw()
    }

    setLabel(label: string) {
      this.label = label
      const caption = this.div?.querySelector("span")
      if (caption) caption.textContent = label
    }
  }

  motoristaOverlayCtor = MotoristaOverlay
  return motoristaOverlayCtor
}

interface MapaMotoristasProps {
  /** Classe aplicada no <div> do mapa em si -- por padrão ocupa toda
   * a altura do container pai (ver uso em mapa.tsx, que controla a
   * altura via flexbox/fullscreen). */
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

  // Chamados ATIVOS de hoje (pendente/aceita) -- vira os pins de
  // destino. Some sozinho da lista quando o motorista marca
  // "cheguei" (status vira concluida), então o pin desaparece do
  // mapa no próximo polling sem precisar de lógica extra aqui.
  const { data: demandasHoje } = useQuery({
    queryKey: ["demandasHoje"],
    queryFn: () => DelegacaoService.readDemandasHoje(),
    refetchInterval: POLLING_MS,
    enabled: loaded,
  })

  // Inicializa o mapa uma única vez, assim que o script carregar
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

  // Sincroniza os marcadores de MOTORISTA com os dados mais recentes
  // -- upsert por motorista_id (mesma lógica de upsert do backend:
  // sobrescreve posição/legenda do overlay existente, nunca acumula
  // duplicado)
  useEffect(() => {
    if (!mapRef.current || !data || !window.google) return

    const idsAtuais = new Set(data.data.map((m) => m.motorista_id))

    for (const [id, overlay] of overlaysRef.current) {
      if (!idsAtuais.has(id)) {
        overlay.setMap(null)
        overlaysRef.current.delete(id)
      }
    }

    for (const motorista of data.data) {
      const position: google.maps.LatLngLiteral = {
        lat: Number(motorista.latitude),
        lng: Number(motorista.longitude),
      }
      const existente = overlaysRef.current.get(motorista.motorista_id)

      if (existente) {
        existente.setPosition(position)
        existente.setLabel(motorista.motorista_nome)
      } else {
        const OverlayCtor = getMotoristaOverlayCtor()
        const overlay = new OverlayCtor(position, motorista.motorista_nome, () => {
          infoWindowRef.current?.setContent(
            `<div style="color:#0f172a"><strong>${motorista.motorista_nome}</strong><br/>Atualizado ${formatarAtualizadoEm(motorista.atualizado_em)}</div>`,
          )
          infoWindowRef.current?.setPosition(position)
          infoWindowRef.current?.open(mapRef.current ?? undefined)
        })
        overlay.setMap(mapRef.current)
        overlaysRef.current.set(motorista.motorista_id, overlay)
      }
    }
  }, [data])

  // Sincroniza os pins de DESTINO com os chamados ativos de hoje --
  // upsert por demanda.id. Sem linha ligando motorista↔destino de
  // propósito (decisão do Ricardo: evitar custo de Directions API) --
  // o InfoWindow do pin já deixa explícito qual motorista aceitou
  // (ou "Aberto", se ainda não tiver dono). Continua usando o Marker
  // padrão do Google (pin vermelho) -- só o marcador de motorista
  // virou overlay customizado.
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
            : "Aberto -- qualquer motorista"
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
        {scriptError}. Confirme VITE_GOOGLE_MAPS_API_KEY no
        frontend/.env.
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
