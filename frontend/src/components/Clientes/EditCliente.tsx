// [mcp-local harness] feature: ajustes-cosmeticos-vendas | plano: 8c042ce9 | 2026-08-05 11:34:56
// Label CPF/CNPJ
// [mcp-local harness] feature: fluxo-vendas-distribuidora-frontend | plano: b8adcd52
// Adiciona campo telefone
//
// [mcp-local harness] feature: ajustes-cosmeticos-vendas | plano: 8c042ce9
// Label "CPF" -> "CPF/CNPJ" (so cosmetico, sem tocar em telefone aqui
// -- e edicao, nao faz sentido forcar prefixo (54) sobre valor ja
// existente)
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Pencil } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { type ClientePublic, ClientesService } from "@/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/ui/loading-button"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

const formSchema = z.object({
  nome: z.string().min(1, { message: "Nome é obrigatório" }),
  cpf: z.string().min(11, { message: "CPF/CNPJ inválido" }),
  telefone: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

interface EditClienteProps {
  cliente: ClientePublic
  onSuccess: () => void
}

const EditCliente = ({ cliente, onSuccess }: EditClienteProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      nome: cliente.nome,
      cpf: cliente.cpf,
      telefone: cliente.telefone ?? "",
    },
  })

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      ClientesService.updateCliente({
        id: cliente.id,
        requestBody: { ...data, telefone: data.telefone || undefined },
      }),
    onSuccess: () => {
      showSuccessToast("Cliente atualizado com sucesso")
      setIsOpen(false)
      onSuccess()
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] })
    },
  })

  const onSubmit = (data: FormData) => mutation.mutate(data)

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuItem
        onSelect={(e) => e.preventDefault()}
        onClick={() => setIsOpen(true)}
      >
        <Pencil />
        Editar Cliente
      </DropdownMenuItem>
      <DialogContent className="sm:max-w-md">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>Editar Cliente</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Nome <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input type="text" {...field} required />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="cpf"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        CPF/CNPJ <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input type="text" {...field} required />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="telefone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefone</FormLabel>
                      <FormControl>
                        <Input type="text" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={mutation.isPending}>
                  Cancelar
                </Button>
              </DialogClose>
              <LoadingButton type="submit" loading={mutation.isPending}>
                Salvar
              </LoadingButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default EditCliente
