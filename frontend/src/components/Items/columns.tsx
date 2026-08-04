// [mcp-local harness] feature: rbac-permission-matrix-and-produtos-frontend | plano: bc499083 | 2026-08-04 14:15:25
// columns vira funcao getColumns(canUpdate, canDelete) para gatear o menu de acoes
import type { ColumnDef } from "@tanstack/react-table"
import { Check, Copy } from "lucide-react"

import type { ItemPublic } from "@/client"
import { Button } from "@/components/ui/button"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import { cn } from "@/lib/utils"
import { ItemActionsMenu } from "./ItemActionsMenu"

function CopyId({ id }: { id: string }) {
  const [copiedText, copy] = useCopyToClipboard()
  const isCopied = copiedText === id

  return (
    <div className="flex items-center gap-1.5 group">
      <span className="font-mono text-xs text-muted-foreground">{id}</span>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => copy(id)}
      >
        {isCopied ? (
          <Check className="size-3 text-green-500" />
        ) : (
          <Copy className="size-3" />
        )}
        <span className="sr-only">Copy ID</span>
      </Button>
    </div>
  )
}

// Recebe as permissões do usuário logado no módulo -- o menu de ações
// (editar/apagar) só aparece pra quem pode fazer aquilo (ex: role
// "vendedor" só tem canRead, então não vê o menu de ações).
export function getColumns(
  canUpdate: boolean,
  canDelete: boolean,
): ColumnDef<ItemPublic>[] {
  return [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => <CopyId id={row.original.id} />,
    },
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.title}</span>
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => {
        const description = row.original.description
        return (
          <span
            className={cn(
              "max-w-xs truncate block text-muted-foreground",
              !description && "italic",
            )}
          >
            {description || "No description"}
          </span>
        )
      },
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <ItemActionsMenu
            item={row.original}
            canUpdate={canUpdate}
            canDelete={canDelete}
          />
        </div>
      ),
    },
  ]
}
