// [mcp-local harness] feature: painel-mapa-frontend | plano: 660739b7 | 2026-08-07 09:41:48
// Layout com fullscreen real + mapa ocupando largura/altura maxima + painel lateral
// Página /mapa -- gate via módulo "mapa" (já existia cadastrado no
// banco desde a migration de módulos de negócio, nunca usado até
// agora). Mapa (marcadores de motoristas via polling) + painel
// lateral (Ranking da Semana + Chamadas hoje) -- pensado pra rodar
// numa TV fixa no escritório do gerente, por isso o botão de tela
// cheia (Fullscreen API real, não é só CSS) e o mapa ocupando toda a
// largura/altura disponível.
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
    if (!canRead) {
      throw redirect({ to: "/" })
    }
  },
  head: () => ({
    meta: [
      {
        title: "Mapa - FastAPI Template",
      },
    ],
  }),
})

function Mapa() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Fullscreen API real -- ao pedir tela cheia num elemento
  // específico (o container do mapa+painel, não a página inteira), o
  // navegador esconde TUDO ao redor (menu lateral, cabeçalho da tela)
  // sozinho, sem precisar de CSS extra pra isso. 'fullscreenchange'
  // sincroniza o estado do botão mesmo se o usuário sair via ESC (que
  // não passa pelo nosso onClick).
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
        <button
          type="button"
          onClick={toggleFullscreen}
          title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
          className="absolute top-3 right-3 z-10 rounded-md border bg-background/90 p-2 shadow-sm hover:bg-muted"
        >
          {isFullscreen ? (
            <Minimize className="h-5 w-5" />
          ) : (
            <Maximize className="h-5 w-5" />
          )}
        </button>

        <MapaMotoristas className="h-full flex-1" />
        <PainelLateral />
      </div>
    </div>
  )
}

export default Mapa
