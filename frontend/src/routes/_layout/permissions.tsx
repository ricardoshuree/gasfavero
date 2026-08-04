// [mcp-local harness] feature: gestao-roles-crud | plano: 9728719f | 2026-08-04 18:34:23
// Adiciona a seção RolesSection (gestão de Roles) acima da lista de módulos/matriz de permissões já existente, com um separador visual
// [mcp-local harness] feature: rbac-permission-matrix-and-produtos-frontend | plano: bc499083 | 2026-08-04 14:14:32
// Nova pagina /permissions -- lista modulos, cada um abre a matriz de permissoes
//
// [mcp-local harness] feature: gestao-roles-crud
// Adiciona a secao "Gerenciar Roles" (criar/editar/apagar Role) acima
// da matriz de modulos ja existente. E o mesmo lugar por ser tudo
// RBAC na mesma tela: primeiro decide quais roles existem, depois o
// que cada uma pode fazer em cada modulo.
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Suspense } from "react"

import { ModulesService, UsersService } from "@/client"
import RolesSection from "@/components/Permissions/RolesSection"
import PermissionMatrixDialog from "@/components/Permissions/PermissionMatrixDialog"

function getModulesQueryOptions() {
  return {
    queryFn: () => ModulesService.readModules(),
    queryKey: ["modules"],
  }
}

export const Route = createFileRoute("/_layout/permissions")({
  component: Permissions,
  beforeLoad: async () => {
    const user = await UsersService.readUserMe()
    if (!user.is_superuser) {
      throw redirect({
        to: "/",
      })
    }
  },
  head: () => ({
    meta: [
      {
        title: "Permissões - FastAPI Template",
      },
    ],
  }),
})

function ModulesListContent() {
  const { data: modules } = useSuspenseQuery(getModulesQueryOptions())

  if (modules.data.length === 0) {
    return (
      <p className="text-muted-foreground">
        Nenhum módulo RBAC cadastrado ainda.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {modules.data.map((module) => (
        <div
          key={module.id}
          className="flex items-center justify-between rounded-lg border px-4 py-3"
        >
          <div>
            <p className="font-medium capitalize">{module.name}</p>
            {module.description && (
              <p className="text-sm text-muted-foreground">
                {module.description}
              </p>
            )}
          </div>
          <PermissionMatrixDialog module={module} />
        </div>
      ))}
    </div>
  )
}

function Permissions() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Permissões</h1>
        <p className="text-muted-foreground">
          Configure o que cada role pode criar, ver, editar e apagar em
          cada módulo. Superusuários sempre têm acesso total.
        </p>
      </div>

      <RolesSection />

      <div className="border-t pt-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Matriz de Permissões</h2>
          <p className="text-sm text-muted-foreground">
            Selecione um módulo para configurar create/read/update/delete
            por role.
          </p>
        </div>
        <Suspense
          fallback={
            <p className="text-muted-foreground">Carregando módulos...</p>
          }
        >
          <ModulesListContent />
        </Suspense>
      </div>
    </div>
  )
}
