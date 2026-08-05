// [mcp-local harness] feature: clientes-precos-vales-frontend | plano: 5db64e4b | 2026-08-04 23:32:14
// Colunas da tabela de Clientes: nome, cpf, endereco vigente, acoes
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
