// [mcp-local harness] feature: rbac-permission-matrix-and-produtos-frontend | plano: bc499083 | 2026-08-04 14:15:38
// Menu de acoes agora recebe canUpdate/canDelete e esconde itens/o menu inteiro conforme permissao
import { EllipsisVertical } from "lucide-react"
import { useState } from "react"

import type { ItemPublic } from "@/client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import DeleteItem from "../Items/DeleteItem"
import EditItem from "../Items/EditItem"

interface ItemActionsMenuProps {
  item: ItemPublic
  canUpdate: boolean
  canDelete: boolean
}

export const ItemActionsMenu = ({
  item,
  canUpdate,
  canDelete,
}: ItemActionsMenuProps) => {
  const [open, setOpen] = useState(false)

  // Sem nenhuma das duas permissões, não tem ação nenhuma pra
  // oferecer -- nem mostra o botão de menu (ex: role "vendedor").
  if (!canUpdate && !canDelete) {
    return null
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <EllipsisVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canUpdate && <EditItem item={item} onSuccess={() => setOpen(false)} />}
        {canDelete && <DeleteItem id={item.id} onSuccess={() => setOpen(false)} />}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
