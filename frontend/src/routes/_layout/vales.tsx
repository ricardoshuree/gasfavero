// [mcp-local harness] feature: clientes-precos-vales-frontend | plano: 5db64e4b | 2026-08-04 23:35:24
// Pagina /vales, com criacao (motorista + intervalo) e lista de blocos na mesma tela
// [mcp-local harness] feature: clientes-precos-vales-frontend | plano: 5db64e4b
// Nova pagina /vales -- gate via modulo 'vales'. Criacao e listagem na mesma
// pagina (como em /permissions): form de criar em cima, tabela embaixo.
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Suspense } from "react"

import { UsersService, ValesService } from "@/client"
import { DataTable } from "@/components/Common/DataTable"
import AddBlocoVale from "@/components/Vales/AddBlocoVale"
import { blocoValeColumns } from "@/components/Vales/columns"
import { usePermissions } from "@/hooks/usePermissions"

const MODULE = "vales"

function getBlocosValeQueryOptions() {
  return {
    queryFn: () => ValesService.readBlocosVale(),
    queryKey: ["blocosVale"],
  }
}

export const Route = createFileRoute("/_layout/vales")({
  component: Vales,
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
        title: "Bloco de Vale - FastAPI Template",
      },
    ],
  }),
})

function BlocosValeTableContent() {
  const { data: blocos } = useSuspenseQuery(getBlocosValeQueryOptions())

  if (blocos.data.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        Nenhum bloco de vale cadastrado ainda
      </p>
    )
  }

  return <DataTable columns={blocoValeColumns} data={blocos.data} />
}

function Vales() {
  const { canCreate } = usePermissions()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bloco de Vale</h1>
          <p className="text-muted-foreground">
            Cadastre o intervalo de folhas do bloco -- o motorista já é
            atribuído no mesmo formulário e fica fixo depois de criado.
          </p>
        </div>
        {canCreate(MODULE) && <AddBlocoVale />}
      </div>
      <Suspense
        fallback={<p className="text-muted-foreground">Carregando blocos...</p>}
      >
        <BlocosValeTableContent />
      </Suspense>
    </div>
  )
}
