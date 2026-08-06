// [mcp-local harness] feature: ajustes-endereco-card-mes-data-vale | plano: 15362128 | 2026-08-05 21:54:14
// Dialog de adicionar/trocar endereco reutilizavel na tela de Vendas
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
import { handleError } from "@/utils"

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
  const { data: ruas } = useQuery({
    queryKey: ["ruas", bairroId],
    queryFn: () => GeografiaService.readRuas({ bairroId }),
    enabled: !!bairroId,
  })

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
      <DialogContent className="sm:max-w-md">
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
            <div className="grid gap-4 py-4">
              <FormField
                control={form.control}
                name="bairro_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
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
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecione o bairro" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {bairros?.data.map((bairro) => (
                          <SelectItem key={bairro.id} value={bairro.id}>
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
                    <FormLabel>
                      Rua <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <RuaAutocomplete
                        value={field.value}
                        onChange={field.onChange}
                        opcoes={ruas?.data}
                        disabled={!bairroId}
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
                      <FormLabel>
                        Número <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
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
                      <FormLabel>Complemento</FormLabel>
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

export default TrocarEnderecoDialog
