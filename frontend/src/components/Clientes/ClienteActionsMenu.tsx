// [mcp-local harness] feature: clientes-precos-vales-frontend | plano: 5db64e4b | 2026-08-04 23:33:21
// Menu de acoes do cliente (editar, trocar endereco), so aparece se canUpdate
import { EllipsisVertical } from "lucide-react"
import { useState } from "react"

import type { ClientePublic } from "@/client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { usePermissions } from "@/hooks/usePermissions"
import EditCliente from "./EditCliente"
import TrocarEndereco from "./TrocarEndereco"

const MODULE = "clientes"

interface ClienteActionsMenuProps {
  cliente: ClientePublic
}

export const ClienteActionsMenu = ({ cliente }: ClienteActionsMenuProps) => {
  const [open, setOpen] = useState(false)
  const { canUpdate } = usePermissions()

  if (!canUpdate(MODULE)) {
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
        <EditCliente cliente={cliente} onSuccess={() => setOpen(false)} />
        <TrocarEndereco cliente={cliente} onSuccess={() => setOpen(false)} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
