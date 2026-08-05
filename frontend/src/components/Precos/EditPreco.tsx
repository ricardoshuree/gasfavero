// [mcp-local harness] feature: clientes-precos-vales-frontend | plano: 5db64e4b | 2026-08-04 23:33:57
// Dialog de definicao de preco vigente de um produto
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CircleDollarSign } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { PrecosService, type ProdutoComPrecoPublic } from "@/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
  valor: z
    .string()
    .min(1, { message: "Informe o valor" })
    .refine(
      (v) =>
        !Number.isNaN(Number(v.replace(",", "."))) &&
        Number(v.replace(",", ".")) > 0,
      {
        message: "Valor precisa ser um número maior que zero",
      },
    ),
})

type FormData = z.infer<typeof formSchema>

interface EditPrecoProps {
  produto: ProdutoComPrecoPublic
}

const EditPreco = ({ produto }: EditPrecoProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: { valor: produto.preco_atual ?? "" },
  })

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      PrecosService.setPreco({
        produtoId: produto.id,
        requestBody: { valor: data.valor.replace(",", ".") },
      }),
    onSuccess: () => {
      showSuccessToast("Preço atualizado com sucesso")
      setIsOpen(false)
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["precos"] })
    },
  })

  const onSubmit = (data: FormData) => mutation.mutate(data)

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CircleDollarSign />
          {produto.preco_atual ? "Editar preço" : "Definir preço"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Preço — {produto.title}</DialogTitle>
          <DialogDescription>
            Cadastrar um novo valor fecha o preço vigente atual e passa a valer
            a partir de agora -- vendas já feitas não mudam.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="py-4">
              <FormField
                control={form.control}
                name="valor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Valor (R$) <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="0,00"
                        type="text"
                        inputMode="decimal"
                        {...field}
                        required
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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

export default EditPreco
