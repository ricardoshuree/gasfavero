// [mcp-local harness] feature: delegacao-venda-fase3-mapa | plano: caf9c096 | 2026-08-07 07:04:53
// Rota /mapa gate via modulo mapa
// Página /mapa -- gate via módulo "mapa" (já existia cadastrado no
// banco desde a migration de módulos de negócio, nunca usado até
// agora). Fase 3 da Delegação de Venda: só a VISUALIZAÇÃO do mapa
// com a última posição conhecida de cada motorista (polling a cada
// 12s) -- sem formulário de despacho ainda, isso fica pra depois
// (decisão combinada com o Ricardo).
import { createFileRoute, redirect } from "@tanstack/react-router"

import { UsersService } from "@/client"
import MapaMotoristas from "@/components/Mapa/MapaMotoristas"

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
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mapa</h1>
        <p className="text-muted-foreground">
          Última posição conhecida de cada motorista.
        </p>
      </div>

      <MapaMotoristas />
    </div>
  )
}

export default Mapa
