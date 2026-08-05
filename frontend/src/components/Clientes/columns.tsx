// [mcp-local harness] feature: fluxo-vendas-distribuidora-frontend | plano: b8adcd52 | 2026-08-05 10:43:34
// Adiciona coluna de telefone
import type { ColumnDef } from "@tanstack/react-table"

import type { ClientePublic } from "@/client"
import { ClienteActionsMenu } from "./ClienteActionsMenu"

export const clienteColumns: ColumnDef<ClientePublic>[] = [
  {
    accessorKey: "nome",
    header: "Nome",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.nome}</span>
    ),
  },
  {
    accessorKey: "cpf",
    header: "CPF",
  },
  {
    accessorKey: "telefone",
    header: "Telefone",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.telefone || "—"}
      </span>
    ),
  },
  {
    id: "endereco",
    header: "Endereço",
    cell: ({ row }) => {
      const endereco = row.original.endereco
      if (!endereco) {
        return <span className="text-muted-foreground">—</span>
      }
      return (
        <span className="text-muted-foreground">
          {endereco.rua_nome}, {endereco.numero}
          {endereco.complemento ? ` (${endereco.complemento})` : ""} —{" "}
          {endereco.bairro_nome}
        </span>
      )
    },
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Ações</span>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <ClienteActionsMenu cliente={row.original} />
      </div>
    ),
  },
]
