// [mcp-local harness] feature: clientes-precos-vales-frontend | plano: 5db64e4b | 2026-08-04 23:35:13
// Colunas da tabela de Blocos de Vale (sem acoes -- bloco e imutavel apos criado, decisao confirmada)
import type { ColumnDef } from "@tanstack/react-table"

import type { BlocoValePublic } from "@/client"
import { Badge } from "@/components/ui/badge"

export const blocoValeColumns: ColumnDef<BlocoValePublic>[] = [
  {
    accessorKey: "motorista_nome",
    header: "Motorista",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.motorista_nome}</span>
    ),
  },
  {
    id: "intervalo",
    header: "Intervalo de folhas",
    cell: ({ row }) => (
      <span>
        {row.original.primeira_folha} — {row.original.ultima_folha}
      </span>
    ),
  },
  {
    accessorKey: "total_vales",
    header: "Total de vales",
    cell: ({ row }) => (
      <Badge variant="secondary">{row.original.total_vales}</Badge>
    ),
  },
  {
    accessorKey: "created_at",
    header: "Criado em",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {new Date(row.original.created_at).toLocaleDateString("pt-BR")}
      </span>
    ),
  },
]
