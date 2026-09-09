// [mcp-local harness] feature: venda_casco_produto | plano: 634c1da9 | 2026-09-09 12:27:33
// Adiciona coluna Casco na tabela de preços: badge com valor quando preenchido, ⚠️ amarelo quando vende_casco=true mas sem preço cadastrado
import type { ColumnDef } from "@tanstack/react-table"
import { AlertTriangle } from "lucide-react"

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
    // coluna de casco: só aparece para produtos com vende_casco=true
    // ⚠️ quando o preço do casco ainda não foi cadastrado
    accessorKey: "preco_casco_atual",
    header: "Casco",
    cell: ({ row }) => {
      const { vende_casco, preco_casco_atual } = row.original
      if (!vende_casco) return null

      if (!preco_casco_atual) {
        return (
          <span
            className="flex items-center gap-1 text-xs font-medium text-amber-500"
            title="Preço do casco não cadastrado"
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            Sem preço
          </span>
        )
      }

      return (
        <Badge variant="secondary" className="text-xs">
          {formatMoney(preco_casco_atual)}
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
