// [mcp-local harness] feature: clientes-precos-vales-frontend | plano: 5db64e4b | 2026-08-04 23:34:36
// Pagina /precos, listando produtos + preco vigente
// [mcp-local harness] feature: clientes-precos-vales-frontend | plano: 5db64e4b
// Nova pagina /precos -- gate via modulo 'produtos' (mesmo do Cadastro do Produto)
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Suspense } from "react"

import { PrecosService, UsersService } from "@/client"
import { DataTable } from "@/components/Common/DataTable"
import { precoColumns } from "@/components/Precos/columns"

const MODULE = "produtos"

function getPrecosQueryOptions() {
  return {
    queryFn: () => PrecosService.readPrecos(),
    queryKey: ["precos"],
  }
}

export const Route = createFileRoute("/_layout/precos")({
  component: Precos,
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
        title: "Preços - FastAPI Template",
      },
    ],
  }),
})

function PrecosTableContent() {
  const { data: produtos } = useSuspenseQuery(getPrecosQueryOptions())

  if (produtos.data.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        Nenhum produto cadastrado ainda -- cadastre produtos em "Cadastro do
        Produto" primeiro.
      </p>
    )
  }

  return <DataTable columns={precoColumns} data={produtos.data} />
}

function Precos() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Cadastro de Preços
        </h1>
        <p className="text-muted-foreground">
          Defina o preço vigente de cada produto do catálogo
        </p>
      </div>
      <Suspense
        fallback={<p className="text-muted-foreground">Carregando preços...</p>}
      >
        <PrecosTableContent />
      </Suspense>
    </div>
  )
}
