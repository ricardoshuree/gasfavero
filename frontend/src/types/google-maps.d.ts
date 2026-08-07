// [mcp-local harness] feature: nome-motorista-no-mapa | plano: 2957ed47 | 2026-08-07 12:03:58
// Adiciona tipagem minima de OverlayView + InfoWindow.setPosition
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
    position?: LatLngLiteral
  }

  class InfoWindow {
    constructor(options?: InfoWindowOptions)
    open(map?: Map, anchor?: Marker): void
    close(): void
    setContent(content: string): void
    setPosition(latLng: LatLngLiteral): void
  }

  // ---- OverlayView -- usado pro marcador customizado do motorista
  // (ícone + nome do motorista sempre visível abaixo, não só no
  // clique). A API real do Google exige estender essa classe e
  // implementar onAdd/draw/onRemove -- tipagem mínima aqui, só o
  // suficiente pro que MapaMotoristas.tsx usa.
  interface MapPanes {
    overlayMouseTarget: HTMLElement
    overlayLayer: HTMLElement
    floatPane: HTMLElement
  }

  interface MapCanvasProjection {
    fromLatLngToDivPixel(latLng: LatLngLiteral): { x: number; y: number } | null
  }

  class OverlayView {
    setMap(map: Map | null): void
    getMap(): Map | null
    getPanes(): MapPanes | undefined
    getProjection(): MapCanvasProjection
  }
}

interface Window {
  google?: typeof google
  __onGoogleMapsLoaded?: () => void
}
