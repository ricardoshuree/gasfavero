// [mcp-local harness] feature: delegacao-venda-fase3-mapa | plano: caf9c096 | 2026-08-07 07:04:14
// Tipagem ambiente minima do Google Maps JS API, evitando dependencia npm nova
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

  interface MarkerOptions {
    position: LatLngLiteral
    map?: Map
    title?: string
    label?: string | MarkerLabel
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
