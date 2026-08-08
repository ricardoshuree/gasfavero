// [mcp-local harness] feature: acessibilidade-cliente-endereco | plano: c4a2bd6c | 2026-08-08 13:14:39
// Campos do formulario (Bairro/Rua/Numero/Complemento) e botoes maiores, mesmo padrao de ClienteSection.tsx. Dialog um pouco mais largo (max-w-md -> max-w-lg) pra acomodar
// [mcp-local harness] feature: acessibilidade-cliente-endereco | plano: c4a2bd6c
// Campos do formulario maiores (fonte/altura/espacamento) -- mesmo pedido
// de acessibilidade aplicado em ClienteSection.tsx
//
// Dialog de adicionar/trocar endereço, usado na tela de Vendas.
// Mesma logica/endpoint do TrocarEndereco.tsx da tela /clientes
// (POST /clientes/{id}/endereco, que fecha o historico e abre um
// novo vigente) -- so que com um Button como trigger em vez de um
// item de dropdown, e retornando o cliente atualizado pra quem
// chamou poder usar o endereco novo direto nessa venda (ClienteSection
// atualiza tanto o cliente quanto o endereco selecionado da venda).
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { type ClientePublic, ClientesService, GeografiaService } from "@/client"
import RuaAutocomplete from "@/components/Common/RuaAutocomplete"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import useCustomToast from "@/hooks/useCustomToast"
import useSugestoesRua from "@/hooks/useSugestoesRua"
import { handleError } from "@/utils"

// Mesmas classes de ClienteSection.tsx -- campo maior (48px/16px) e
// label maior, pedido de acessibilidade.
const CAMPO_ACESSIVEL = "h-12 px-4 text-base"
const LABEL_ACESSIVEL = "text-base"

const formSchema = z.object({
  bairro_id: z.string().min(1, { message: "Selecione um bairro" }),
  rua_nome: z.string().min(1, { message: "Rua é obrigatória" }),
  numero: z.string().min(1, { message: "Número é obrigatório" }),
  complemento: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

interface TrocarEnderecoDialogProps {
  cliente: ClientePublic
  onSalvo: (clienteAtualizado: ClientePublic) => void
}

export function TrocarEnderecoDialog({
  cliente,
  onSalvo,
}: TrocarEnderecoDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: { bairro_id: "", rua_nome: "", numero: "", complemento: "" },
  })

  const bairroId = form.watch("bairro_id")

  const { data: bairros } = useQuery({
    queryKey: ["bairros"],
    queryFn: () => GeografiaService.readBairros(),
    enabled: isOpen,
  })
  const { opcoes: ruasSugeridas } = useSugestoesRua(bairroId)

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      ClientesService.trocarEndereco({
        id: cliente.id,
        requestBody: {
          bairro_id: data.bairro_id,
          rua_nome: data.rua_nome,
          numero: data.numero,
          complemento: data.complemento || undefined,
        },
      }),
    onSuccess: (clienteAtualizado) => {
      showSuccessToast("Endereço salvo com sucesso")
      form.reset()
      setIsOpen(false)
      onSalvo(clienteAtualizado)
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] })
    },
  })

  const onSubmit = (data: FormData) => mutation.mutate(data)

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {cliente.endereco ? (
          <Button type="button" variant="ghost" size="sm">
            Trocar endereço
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm">
            <Plus className="mr-1 h-3 w-3" />
            Adicionar endereço
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {cliente.endereco ? "Trocar Endereço" : "Adicionar Endereço"}
          </DialogTitle>
          <DialogDescription>
            {cliente.endereco ? (
              <>
                Endereço atual: {cliente.endereco.rua_nome},{" "}
                {cliente.endereco.numero} — {cliente.endereco.bairro_nome}. O
                anterior fica guardado no histórico, não é apagado.
              </>
            ) : (
              "Fica registrado no cadastro do cliente e já entra selecionado nessa venda."
            )}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-5 py-4">
              <FormField
                control={form.control}
                name="bairro_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={LABEL_ACESSIVEL}>
                      Bairro <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value)
                        form.setValue("rua_nome", "")
                      }}
                    >
                      <FormControl>
                        <SelectTrigger className={`w-full ${CAMPO_ACESSIVEL}`}>
                          <SelectValue placeholder="Selecione o bairro" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {bairros?.data.map((bairro) => (
                          <SelectItem
                            key={bairro.id}
                            value={bairro.id}
                            className="py-2.5 text-base"
                          >
                            {bairro.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="rua_nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={LABEL_ACESSIVEL}>
                      Rua <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <RuaAutocomplete
                        value={field.value}
                        onChange={field.onChange}
                        opcoes={ruasSugeridas}
                        disabled={!bairroId}
                        className={CAMPO_ACESSIVEL}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="numero"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={LABEL_ACESSIVEL}>
                        Número <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          className={CAMPO_ACESSIVEL}
                          placeholder="123 ou s/n"
                          type="text"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="complemento"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={LABEL_ACESSIVEL}>
                        Complemento
                      </FormLabel>
                      <FormControl>
                        <Input className={CAMPO_ACESSIVEL} type="text" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button
                  variant="outline"
                  size="lg"
                  className="h-12 text-base"
                  disabled={mutation.isPending}
                >
                  Cancelar
                </Button>
              </DialogClose>
              <LoadingButton
                type="submit"
                size="lg"
                className="h-12 text-base"
                loading={mutation.isPending}
              >
                Salvar
              </LoadingButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default TrocarEnderecoDialog
