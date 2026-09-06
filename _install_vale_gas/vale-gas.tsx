import { createFileRoute, redirect } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Suspense } from "react"

import { UsersService } from "@/client"
import { DataTable } from "@/components/Common/DataTable"
import AddBlocoValeGas from "@/components/ValeGas/AddBlocoValeGas"
import { blocoValeGasColumns, type BlocoValeGasPublic } from "@/components/ValeGas/columns"
import { usePermissions } from "@/hooks/usePermissions"

const MODULE = "vale_gas"
const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"

export const Route = createFileRoute("/_layout/vale-gas")({
  component: ValeGas,
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
    meta: [{ title: "Bloco de Vale Gás - Gás Favero" }],
  }),
})

function useBlocosValeGas() {
  return useQuery<{ data: BlocoValeGasPublic[] }>({
    queryKey: ["blocosValeGas"],
    queryFn: async () => {
      const token = localStorage.getItem("access_token")
      const res = await fetch(`${API}/api/v1/vale-gas/blocos`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error("Erro ao carregar blocos")
      return res.json()
    },
  })
}

function TabelaBlocos() {
  const { data, isLoading } = useBlocosValeGas()

  if (isLoading) {
    return <p className="text-muted-foreground">Carregando blocos...</p>
  }

  if (!data || data.data.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        Nenhum bloco de Vale Gás cadastrado ainda
      </p>
    )
  }

  return <DataTable columns={blocoValeGasColumns} data={data.data} />
}

function ValeGas() {
  const { canCreate } = usePermissions()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bloco de Vale Gás</h1>
          <p className="text-muted-foreground">
            Associe um estabelecimento comercial ao talão de vale gás impresso pela gráfica.
            Um bloco por estabelecimento.
          </p>
        </div>
        {canCreate(MODULE) && <AddBlocoValeGas />}
      </div>
      <Suspense fallback={<p className="text-muted-foreground">Carregando...</p>}>
        <TabelaBlocos />
      </Suspense>
    </div>
  )
}
