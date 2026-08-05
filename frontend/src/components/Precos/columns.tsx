// [mcp-local harness] feature: clientes-precos-vales-frontend | plano: 5db64e4b | 2026-08-04 23:34:26
// Colunas de Precos, com PrecoActionsCell como componente proprio (evita hook solto dentro de arrow function inline)
import type { ColumnDef } from "@tanstack/react-table"

import type { ProdutoComPrecoPublic } from "@/client"
import { Badge } from "@/components/ui/badge"
import { usePermissions } from "@/hooks/usePermissions"
import EditPreco from "./EditPreco"

function formatMoney(valor: string | null | undefined): string {
  if (!valor) return "—"
  const numero = Number(valor)
  if (Number.isNaN(numero)) return valor
  return numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function PrecoActionsCell({ produto }: { produto: ProdutoComPrecoPublic }) {
  const { canUpdate } = usePermissions()
  if (!canUpdate("produtos")) return null
  return (
    <div className="flex justify-end">
      <EditPreco produto={produto} />
    </div>
  )
}

export const precoColumns: ColumnDef<ProdutoComPrecoPublic>[] = [
  {
    accessorKey: "title",
    header: "Produto",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.title}</span>
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
    accessorKey: "preco_atual",
    header: "Preço vigente",
    cell: ({ row }) => {
      const valor = row.original.preco_atual
      return (
        <Badge variant={valor ? "default" : "secondary"}>
          {formatMoney(valor)}
        </Badge>
      )
    },
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Ações</span>,
    cell: ({ row }) => <PrecoActionsCell produto={row.original} />,
  },
]
