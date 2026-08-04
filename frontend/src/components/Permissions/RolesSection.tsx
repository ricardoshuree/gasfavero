// [mcp-local harness] feature: gestao-roles-crud | plano: 9728719f | 2026-08-04 18:34:10
// Seção "Gerenciar Roles" com tabela + botão de criar, para compor no topo da tela /permissions
import { useSuspenseQuery } from "@tanstack/react-query"
import { Suspense } from "react"

import { RolesService } from "@/client"
import { DataTable } from "@/components/Common/DataTable"
import AddRole from "./AddRole"
import { roleColumns } from "./columns"

function getRolesQueryOptions() {
  return {
    queryFn: () => RolesService.readRoles(),
    queryKey: ["roles"],
  }
}

function RolesTableContent() {
  const { data: roles } = useSuspenseQuery(getRolesQueryOptions())
  return <DataTable columns={roleColumns} data={roles.data} />
}

function RolesSection() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Gerenciar Roles</h2>
          <p className="text-sm text-muted-foreground">
            Crie, renomeie ou apague roles RBAC (ex: "gerente", "motorista").
            Depois de criada, configure o que ela pode fazer em cada módulo
            na matriz abaixo.
          </p>
        </div>
        <AddRole />
      </div>
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Carregando roles...</p>
        }
      >
        <RolesTableContent />
      </Suspense>
    </div>
  )
}

export default RolesSection
