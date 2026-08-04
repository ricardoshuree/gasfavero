// [mcp-local harness] feature: gestao-roles-crud | plano: 9728719f | 2026-08-04 18:33:51
// Dialog de exclusão de Role, avisando quantos usuários e permissões serão afetados pelo cascade (RolePermission/UserRole)
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Trash2 } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"

import { type RolePublic, RolesService } from "@/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { LoadingButton } from "@/components/ui/loading-button"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

interface DeleteRoleProps {
  role: RolePublic
  onSuccess: () => void
}

const DeleteRole = ({ role, onSuccess }: DeleteRoleProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { handleSubmit } = useForm()

  const mutation = useMutation({
    mutationFn: () => RolesService.deleteRole({ roleId: role.id }),
    onSuccess: () => {
      showSuccessToast("Role apagada com sucesso")
      setIsOpen(false)
      onSuccess()
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] })
      queryClient.invalidateQueries({ queryKey: ["users"] })
      queryClient.invalidateQueries({ queryKey: ["modules"] })
    },
  })

  const onSubmit = async () => {
    mutation.mutate()
  }

  const userCount = role.user_count ?? 0

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuItem
        variant="destructive"
        onSelect={(e) => e.preventDefault()}
        onClick={() => setIsOpen(true)}
      >
        <Trash2 />
        Apagar Role
      </DropdownMenuItem>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Apagar Role "{role.name}"</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                {userCount > 0 ? (
                  <p>
                    Essa role está atribuída a{" "}
                    <strong>
                      {userCount} usuário{userCount > 1 ? "s" : ""}
                    </strong>
                    . Apagar vai <strong>desvincular todos eles</strong> e
                    remover toda a matriz de permissões dessa role. Essa ação
                    não pode ser desfeita.
                  </p>
                ) : (
                  <p>
                    Nenhum usuário está vinculado a essa role no momento.
                    Apagar também remove a matriz de permissões associada a
                    ela. Essa ação não pode ser desfeita.
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-4">
            <DialogClose asChild>
              <Button variant="outline" disabled={mutation.isPending}>
                Cancelar
              </Button>
            </DialogClose>
            <LoadingButton
              variant="destructive"
              type="submit"
              loading={mutation.isPending}
            >
              Apagar
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default DeleteRole
