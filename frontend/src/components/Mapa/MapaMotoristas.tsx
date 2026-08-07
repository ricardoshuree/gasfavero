// [mcp-local harness] feature: delegacao-venda-fase3-mapa | plano: caf9c096 | 2026-08-07 07:04:42
// Componente do mapa com polling de localizacao dos motoristas
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

export function MapaMotoristas() {
  const { loaded, error: scriptError } = useGoogleMapsScript()
  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<globalThis.Map<string, google.maps.Marker>>(
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

  // Sincroniza os marcadores com os dados mais recentes -- upsert por
  // motorista_id (mesma lógica de upsert do backend: sobrescreve
  // posição do marcador existente, nunca acumula duplicado)
  useEffect(() => {
    if (!mapRef.current || !data || !window.google) return

    const idsAtuais = new Set(data.data.map((m) => m.motorista_id))

    // remove marcadores de motoristas que saíram da lista -- defensivo
    // (não deveria acontecer hoje, já que não há DELETE de
    // localização, mas evita marcador órfão se o dado mudar)
    for (const [id, marker] of markersRef.current) {
      if (!idsAtuais.has(id)) {
        marker.setMap(null)
        markersRef.current.delete(id)
      }
    }

    for (const motorista of data.data) {
      const position: google.maps.LatLngLiteral = {
        lat: Number(motorista.latitude),
        lng: Number(motorista.longitude),
      }
      const existente = markersRef.current.get(motorista.motorista_id)

      if (existente) {
        existente.setPosition(position)
      } else {
        const marker = new window.google.maps.Marker({
          position,
          map: mapRef.current,
          title: motorista.motorista_nome,
        })
        marker.addListener("click", () => {
          infoWindowRef.current?.setContent(
            `<strong>${motorista.motorista_nome}</strong><br/>Atualizado ${formatarAtualizadoEm(motorista.atualizado_em)}`,
          )
          infoWindowRef.current?.open(mapRef.current ?? undefined, marker)
        })
        markersRef.current.set(motorista.motorista_id, marker)
      }
    }
  }, [data])

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
    <div className="flex flex-col gap-2">
      <div
        ref={mapDivRef}
        className="h-[600px] w-full rounded-md border"
        aria-label="Mapa com a localização dos motoristas"
      />
      {!isLoading && data?.data.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum motorista com localização registrada ainda.
        </p>
      )}
    </div>
  )
}

export default MapaMotoristas
