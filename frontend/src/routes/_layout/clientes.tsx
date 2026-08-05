// [mcp-local harness] feature: clientes-precos-vales-frontend | plano: 5db64e4b | 2026-08-04 23:33:36
// Pagina /clientes com busca por nome/cpf
// [mcp-local harness] feature: clientes-precos-vales-frontend | plano: 5db64e4b
// Nova pagina /clientes -- gate via modulo 'clientes', busca por nome/cpf
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Search } from "lucide-react"
import { Suspense, useState } from "react"

import { ClientesService, UsersService } from "@/client"
import AddCliente from "@/components/Clientes/AddCliente"
import { clienteColumns } from "@/components/Clientes/columns"
import { DataTable } from "@/components/Common/DataTable"
import { Input } from "@/components/ui/input"
import { usePermissions } from "@/hooks/usePermissions"

const MODULE = "clientes"

export const Route = createFileRoute("/_layout/clientes")({
  component: Clientes,
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
        title: "Clientes - FastAPI Template",
      },
    ],
  }),
})

function ClientesTableContent({ q }: { q: string }) {
  const { data: clientes } = useSuspenseQuery({
    queryKey: ["clientes", q],
    queryFn: () =>
      ClientesService.readClientes({ q: q || undefined, limit: 100 }),
  })

  if (clientes.data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Search className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">
          {q ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado ainda"}
        </h3>
        <p className="text-muted-foreground">
          {q
            ? "Tente buscar por outro nome ou CPF"
            : "Adicione um novo cliente para começar"}
        </p>
      </div>
    )
  }

  return <DataTable columns={clienteColumns} data={clientes.data} />
}

function Clientes() {
  const { canCreate } = usePermissions()
  const [q, setQ] = useState("")

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">
            Cadastro de clientes e endereços
          </p>
        </div>
        {canCreate(MODULE) && <AddCliente />}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou CPF..."
          className="pl-8"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <Suspense
        fallback={
          <p className="text-muted-foreground">Carregando clientes...</p>
        }
      >
        <ClientesTableContent q={q} />
      </Suspense>
    </div>
  )
}
