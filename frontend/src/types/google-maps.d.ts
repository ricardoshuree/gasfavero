// [mcp-local harness] feature: painel-mapa-frontend | plano: 660739b7 | 2026-08-07 09:40:03
// Adiciona Size/Icon (icone raster customizado) na tipagem ambiente do Google Maps
// Tipagem mínima ambiente para a fatia da API do Google Maps
// JavaScript usada pelo MapaMotoristas (Fase 3 da Delegação de
// Venda) -- evita depender do pacote @types/google.maps só por
// isso. Se o projeto passar a usar mais da API no futuro (ex:
// Directions API pra otimização de rota, item deixado no backlog),
// vale trocar por @types/google.maps de verdade.

declare namespace google.maps {
  interface LatLngLiteral {
    lat: number
    lng: number
  }

  interface MapOptions {
    center?: LatLngLiteral
    zoom?: number
    mapId?: string
    mapTypeControl?: boolean
    streetViewControl?: boolean
    fullscreenControl?: boolean
  }

  class Map {
    constructor(element: HTMLElement, options?: MapOptions)
    setCenter(latLng: LatLngLiteral): void
    panTo(latLng: LatLngLiteral): void
  }

  interface MarkerLabel {
    text: string
    color?: string
    fontWeight?: string
    fontSize?: string
  }

  // Tamanho em pixels de um ícone de marcador raster (não é a classe
  // real google.maps.Size, só um literal compatível -- a API só lê
  // .width/.height em runtime, então um objeto plano funciona igual).
  interface Size {
    width: number
    height: number
  }

  // Ícone raster (imagem própria, ex: /images/caminhao-motorista.png)
  // -- diferente de um ícone vetorial (Symbol), que este projeto não
  // usa.
  interface Icon {
    url: string
    scaledSize?: Size
  }

  interface MarkerOptions {
    position: LatLngLiteral
    map?: Map
    title?: string
    label?: string | MarkerLabel
    icon?: string | Icon
  }

  class Marker {
    constructor(options: MarkerOptions)
    setMap(map: Map | null): void
    setPosition(latLng: LatLngLiteral): void
    getPosition(): LatLngLiteral | undefined
    addListener(eventName: string, handler: () => void): void
  }

  interface InfoWindowOptions {
    content?: string
  }

  class InfoWindow {
    constructor(options?: InfoWindowOptions)
    open(map?: Map, anchor?: Marker): void
    close(): void
    setContent(content: string): void
  }
}

interface Window {
  google?: typeof google
  __onGoogleMapsLoaded?: () => void
}
