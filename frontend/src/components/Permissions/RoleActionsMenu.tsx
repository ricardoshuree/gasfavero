// [mcp-local harness] feature: gestao-roles-crud | plano: 9728719f | 2026-08-04 18:33:57
// Menu de ações (editar/apagar) por linha da tabela de Roles, mesmo padrão do UserActionsMenu
import { EllipsisVertical } from "lucide-react"
import { useState } from "react"

import type { RolePublic } from "@/client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import DeleteRole from "./DeleteRole"
import EditRole from "./EditRole"

interface RoleActionsMenuProps {
  role: RolePublic
}

export const RoleActionsMenu = ({ role }: RoleActionsMenuProps) => {
  const [open, setOpen] = useState(false)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <EllipsisVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <EditRole role={role} onSuccess={() => setOpen(false)} />
        <DeleteRole role={role} onSuccess={() => setOpen(false)} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
