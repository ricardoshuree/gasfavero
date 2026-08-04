// [mcp-local harness] feature: rbac-permission-matrix-and-produtos-frontend | plano: bc499083 | 2026-08-04 14:15:12
// Nova pagina /produtos, renomeada de items.tsx, com gate de canRead/canCreate/canUpdate/canDelete via modulo 'produtos'
// Renomeado de items.tsx -- tecnicamente ainda consome ItemsService
// (nome interno do backend, ver backend/app/api/routes/items.py), mas
// e a tela de "Cadastro do Produto" pro usuario final. Controle de
// acesso pelo modulo RBAC "produtos": ver (canRead), criar
// (canCreate), editar (canUpdate) e apagar (canDelete) sao
// independentes -- ex: role "vendedor" so tem canRead.
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Search } from "lucide-react"
import { Suspense } from "react"

import { ItemsService, UsersService } from "@/client"
import { DataTable } from "@/components/Common/DataTable"
import AddItem from "@/components/Items/AddItem"
import { getColumns } from "@/components/Items/columns"
import PendingItems from "@/components/Pending/PendingItems"
import { usePermissions } from "@/hooks/usePermissions"

const MODULE = "produtos"

function getItemsQueryOptions() {
  return {
    queryFn: () => ItemsService.readItems({ skip: 0, limit: 100 }),
    queryKey: ["items"],
  }
}

export const Route = createFileRoute("/_layout/produtos")({
  component: Produtos,
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
        title: "Produtos - FastAPI Template",
      },
    ],
  }),
})

function ItemsTableContent() {
  const { data: items } = useSuspenseQuery(getItemsQueryOptions())
  const { canUpdate, canDelete } = usePermissions()

  if (items.data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Search className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">
          Nenhum produto cadastrado ainda
        </h3>
        <p className="text-muted-foreground">
          Adicione um novo produto para começar
        </p>
      </div>
    )
  }

  return (
    <DataTable
      columns={getColumns(canUpdate(MODULE), canDelete(MODULE))}
      data={items.data}
    />
  )
}

function ItemsTable() {
  return (
    <Suspense fallback={<PendingItems />}>
      <ItemsTableContent />
    </Suspense>
  )
}

function Produtos() {
  const { canCreate } = usePermissions()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Cadastro do Produto
          </h1>
          <p className="text-muted-foreground">
            Catálogo de produtos -- visão compartilhada, controlada por
            permissão de módulo
          </p>
        </div>
        {canCreate(MODULE) && <AddItem />}
      </div>
      <ItemsTable />
    </div>
  )
}
