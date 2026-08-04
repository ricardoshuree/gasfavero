// [mcp-local harness] feature: gestao-roles-crud | plano: 9728719f | 2026-08-04 18:34:03
// Definição de colunas da tabela de Roles (nome, descrição, usuários vinculados, ações)
import type { ColumnDef } from "@tanstack/react-table"

import type { RolePublic } from "@/client"
import { Badge } from "@/components/ui/badge"
import { RoleActionsMenu } from "./RoleActionsMenu"

export const roleColumns: ColumnDef<RolePublic>[] = [
  {
    accessorKey: "name",
    header: "Nome",
    cell: ({ row }) => (
      <span className="font-medium capitalize">{row.original.name}</span>
    ),
  },
  {
    accessorKey: "description",
    header: "Descrição",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.description || "—"}
      </span>
    ),
  },
  {
    accessorKey: "user_count",
    header: "Usuários",
    cell: ({ row }) => {
      const count = row.original.user_count ?? 0
      return (
        <Badge variant={count > 0 ? "default" : "secondary"}>
          {count}
        </Badge>
      )
    },
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Ações</span>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <RoleActionsMenu role={row.original} />
      </div>
    ),
  },
]
