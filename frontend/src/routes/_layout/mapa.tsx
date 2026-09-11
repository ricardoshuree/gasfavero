// [mcp-local harness] feature: painel-lateral-ux | plano: 1a17d113 | 2026-09-11 20:45:36
// Botão fullscreen menor: p-1.5, ícone h-4 w-4, posição top-2 right-2
// Layout /mapa — mapa + painel lateral (Ranking + Chamadas + PlayerAvisos)
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Maximize, Minimize } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { UsersService } from "@/client"
import MapaMotoristas from "@/components/Mapa/MapaMotoristas"
import PainelLateral from "@/components/Mapa/PainelLateral"
import { cn } from "@/lib/utils"

const MODULE = "mapa"

export const Route = createFileRoute("/_layout/mapa")({
  component: Mapa,
  beforeLoad: async () => {
    const perms = await UsersService.readUserPermissions()
    const canRead =
      perms.is_superuser ||
      perms.permissions.some((p) => p.module === MODULE && p.can_read)
    if (!canRead) throw redirect({ to: "/" })
  },
  head: () => ({ meta: [{ title: "Mapa - GasFavero" }] }),
})

function Mapa() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener("fullscreenchange", handler)
    return () => document.removeEventListener("fullscreenchange", handler)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  return (
    <div className="flex h-[calc(100vh-140px)] flex-col gap-4">
      {!isFullscreen && (
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mapa</h1>
          <p className="text-muted-foreground">
            Última posição conhecida de cada motorista.
          </p>
        </div>
      )}

      <div
        ref={containerRef}
        className={cn(
          "relative flex min-h-0 flex-1 gap-3",
          isFullscreen && "h-screen w-screen bg-background p-4",
        )}
      >
        {/* Botão fullscreen menor — p-1.5, ícone h-4 w-4 */}
        <button
          type="button"
          onClick={toggleFullscreen}
          title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
          className="absolute top-2 right-2 z-10 rounded-md border bg-background/90 p-1.5 shadow-sm hover:bg-muted"
        >
          {isFullscreen ? (
            <Minimize className="h-4 w-4" />
          ) : (
            <Maximize className="h-4 w-4" />
          )}
        </button>

        <MapaMotoristas className="h-full flex-1" />
        <PainelLateral />
      </div>
    </div>
  )
}

export default Mapa
