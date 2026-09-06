import type { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"

export interface BlocoValeGasPublic {
  id: string
  cliente_id: string
  cliente_nome: string
  cliente_cpf: string
  primeira_folha: number
  ultima_folha: number
  total_folhas: number
  data: string
  created_at: string
}

export const blocoValeGasColumns: ColumnDef<BlocoValeGasPublic>[] = [
  {
    accessorKey: "cliente_nome",
    header: "Estabelecimento",
    cell: ({ row }) => (
      <div>
        <p className="font-medium">{row.original.cliente_nome}</p>
        <p className="text-xs text-muted-foreground">{row.original.cliente_cpf}</p>
      </div>
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
    accessorKey: "total_folhas",
    header: "Total de folhas",
    cell: ({ row }) => (
      <Badge variant="secondary">{row.original.total_folhas}</Badge>
    ),
  },
  {
    accessorKey: "data",
    header: "Data de circulação",
    cell: ({ row }) => {
      const [ano, mes, dia] = row.original.data.split("-")
      return <span className="text-muted-foreground">{dia}/{mes}/{ano}</span>
    },
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
