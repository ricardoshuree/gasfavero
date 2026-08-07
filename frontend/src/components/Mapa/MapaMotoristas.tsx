// [mcp-local harness] feature: pin-destino-padrao | plano: 8e2a1a1e | 2026-08-07 10:19:33
// Remove icone customizado do pin de destino, volta ao pin padrao vermelho do Google
// Componente do mapa com polling de localizacao dos motoristas +
// pins de destino dos chamados ativos (pendente/aceita) de hoje.
import { useQuery } from "@tanstack/react-query"
import { useEffect, useRef } from "react"

import {
  DelegacaoService,
  type DemandaVendaPublic,
  type MotoristaLocalizacaoPublic,
} from "@/client"
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
// -- ver frontend/public/images/. 40x40 fica proporcional ao zoom 14
// sem tampar ruas pequenas no mapa.
const ICONE_MOTORISTA: google.maps.Icon = {
  url: "/images/caminhao-motorista.png",
  scaledSize: { width: 40, height: 40 },
}

// Pin de DESTINO (endereço do chamado ativo): usa o marcador PADRÃO
// vermelho do Google, sem ícone customizado (decisão do Ricardo --
// testamos com /images/produto-gas.png e ele preferiu voltar pro
// pin padrão pra diferenciar melhor visualmente do marcador de
// motorista). Basta omitir a opção `icon` na criação do Marker.

// InfoWindow do Google sempre renderiza com fundo branco -- mas o
// app roda em tema escuro por padrão, e a cor de texto do <body>
// (branca no dark mode) vaza pra dentro do conteúdo HTML injetado
// no popup via cascata CSS normal (o InfoWindow não tem isolamento
// de estilo próprio). Sem essa cor fixa, o texto ficava branco
// sobre fundo branco -- invisível. `color: #0f172a` = slate-900,
// sempre escuro, independente do tema ativo no resto do app.
const INFOWINDOW_TEXT_STYLE = "color:#0f172a"

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
  const markersRef = useRef<globalThis.Map<string, google.maps.Marker>>(
    new globalThis.Map(),
  )
  const destinoMarkersRef = useRef<globalThis.Map<string, google.maps.Marker>>(
    new globalThis.Map(),
  )
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null)

  // Dado mais recente por id -- os listeners de clique dos
  // marcadores leem DAQUI na hora do clique (não fecham sobre o
  // objeto do momento da criação do marcador). Sem isso, um marcador
  // já existente (só teve a posição atualizada via setPosition, não
  // recriado) continuava abrindo o InfoWindow com o texto de quando
  // foi criado pela primeira vez -- ex: clicar de novo depois do
  // motorista aceitar um chamado aberto continuava mostrando "Aberto
  // -- qualquer motorista" (bug real, encontrado em teste manual).
  const motoristasDataRef = useRef<globalThis.Map<string, MotoristaLocalizacaoPublic>>(
    new globalThis.Map(),
  )
  const demandasDataRef = useRef<globalThis.Map<string, DemandaVendaPublic>>(
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
  // sobrescreve posição do marcador existente, nunca acumula
  // duplicado)
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
        motoristasDataRef.current.delete(id)
      }
    }

    for (const motorista of data.data) {
      motoristasDataRef.current.set(motorista.motorista_id, motorista)

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
          icon: ICONE_MOTORISTA,
        })
        marker.addListener("click", () => {
          const atual = motoristasDataRef.current.get(motorista.motorista_id)
          if (!atual) return
          infoWindowRef.current?.setContent(
            `<div style="${INFOWINDOW_TEXT_STYLE}"><strong>${atual.motorista_nome}</strong><br/>Atualizado ${formatarAtualizadoEm(atual.atualizado_em)}</div>`,
          )
          infoWindowRef.current?.open(mapRef.current ?? undefined, marker)
        })
        markersRef.current.set(motorista.motorista_id, marker)
      }
    }
  }, [data])

  // Sincroniza os pins de DESTINO com os chamados ativos de hoje --
  // upsert por demanda.id. Sem linha ligando motorista↔destino de
  // propósito (decisão do Ricardo: evitar custo de Directions API) --
  // o InfoWindow do pin já deixa explícito qual motorista aceitou
  // (ou "Aberto", se ainda não tiver dono).
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
        demandasDataRef.current.delete(id)
      }
    }

    for (const demanda of ativas) {
      demandasDataRef.current.set(demanda.id, demanda)

      if (!demanda.endereco.latitude || !demanda.endereco.longitude) continue

      const position: google.maps.LatLngLiteral = {
        lat: Number(demanda.endereco.latitude),
        lng: Number(demanda.endereco.longitude),
      }
      const existente = destinoMarkersRef.current.get(demanda.id)

      if (existente) {
        existente.setPosition(position)
      } else {
        // Sem `icon` de propósito -- pin padrão vermelho do Google
        // (ver comentário acima da constante ICONE_MOTORISTA).
        const marker = new window.google.maps.Marker({
          position,
          map: mapRef.current,
          title: demanda.cliente_nome,
        })
        marker.addListener("click", () => {
          const atual = demandasDataRef.current.get(demanda.id)
          if (!atual) return
          const quemAceitou = atual.motorista_nome
            ? `Motorista: ${atual.motorista_nome}`
            : "Aberto -- qualquer motorista"
          infoWindowRef.current?.setContent(
            `<div style="${INFOWINDOW_TEXT_STYLE}"><strong>${atual.cliente_nome}</strong><br/>${atual.endereco.rua_nome}, ${atual.endereco.numero}<br/>${quemAceitou}</div>`,
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
