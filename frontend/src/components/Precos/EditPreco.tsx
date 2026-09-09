// [mcp-local harness] feature: venda_casco_produto | plano: 139ac581 | 2026-09-09 11:59:24
// Adiciona campo preco_casco condicional: aparece e é obrigatório quando produto.vende_casco=true
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

const valorSchema = z
  .string()
  .min(1, { message: "Informe o valor" })
  .refine(
    (v) =>
      !Number.isNaN(Number(v.replace(",", "."))) &&
      Number(v.replace(",", ".")) > 0,
    { message: "Valor precisa ser um número maior que zero" },
  )

const formSchema = z.object({
  valor: valorSchema,
  preco_casco: z.string().optional(),
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
    defaultValues: {
      valor: produto.preco_atual ?? "",
      preco_casco: produto.preco_casco_atual ?? "",
    },
  })

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const precoCasco = produto.vende_casco && data.preco_casco
        ? data.preco_casco.replace(",", ".")
        : undefined
      return PrecosService.setPreco({
        produtoId: produto.id,
        requestBody: {
          valor: data.valor.replace(",", "."),
          preco_casco: precoCasco,
        },
      })
    },
    onSuccess: () => {
      showSuccessToast("Preço atualizado com sucesso")
      setIsOpen(false)
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["precos"] })
    },
  })

  const onSubmit = (data: FormData) => {
    // Valida preco_casco quando o produto vende casco
    if (produto.vende_casco) {
      const v = data.preco_casco?.replace(",", ".")
      if (!v || Number.isNaN(Number(v)) || Number(v) <= 0) {
        form.setError("preco_casco", {
          message: "Informe o preço do casco (obrigatório para este produto)",
        })
        return
      }
    }
    mutation.mutate(data)
  }

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
            a partir de agora — vendas já feitas não mudam.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-4 py-4">
              <FormField
                control={form.control}
                name="valor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Preço do gás (R$){" "}
                      <span className="text-destructive">*</span>
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

              {/* campo de preço do casco: só aparece quando produto.vende_casco=true */}
              {produto.vende_casco && (
                <FormField
                  control={form.control}
                  name="preco_casco"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Preço do casco (R$){" "}
                        <span className="text-destructive">*</span>
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
              )}
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
