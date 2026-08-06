// [mcp-local harness] feature: logradouros-referencia-autocomplete | plano: f032de2c | 2026-08-06 15:47:25
// Substitui useQuery(ruas) por useSugestoesRua(bairroId)
// [mcp-local harness] feature: logradouros-referencia-autocomplete
// Troca useQuery(ruas) local por useSugestoesRua
//
// [mcp-local harness] feature: ajustes-cosmeticos-vendas | plano: 8c042ce9 | 2026-08-05 11:35:23
// RuaAutocomplete no lugar do datalist
// [mcp-local harness] feature: clientes-precos-vales-frontend | plano: 5db64e4b | 2026-08-04 23:33:52
// Dialog de troca de endereco do cliente, fechando o vigente no backend
//
// [mcp-local harness] fix: BairrosService -> GeografiaService
//
// [mcp-local harness] feature: ajustes-cosmeticos-vendas | plano: 8c042ce9
// RuaAutocomplete no lugar do datalist nativo
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { MapPin } from "lucide-react"
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

const formSchema = z.object({
  bairro_id: z.string().min(1, { message: "Selecione um bairro" }),
  rua_nome: z.string().min(1, { message: "Rua é obrigatória" }),
  numero: z.string().min(1, { message: "Número é obrigatório" }),
  complemento: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

interface TrocarEnderecoProps {
  cliente: ClientePublic
  onSuccess: () => void
}

const TrocarEndereco = ({ cliente, onSuccess }: TrocarEnderecoProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      bairro_id: "",
      rua_nome: "",
      numero: "",
      complemento: "",
    },
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
    onSuccess: () => {
      showSuccessToast("Endereço atualizado com sucesso")
      form.reset()
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
        <MapPin />
        Trocar Endereço
      </DropdownMenuItem>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Trocar Endereço</DialogTitle>
          <DialogDescription>
            {cliente.endereco ? (
              <>
                Endereço atual: {cliente.endereco.rua_nome},{" "}
                {cliente.endereco.numero} — {cliente.endereco.bairro_nome}.{" "}
              </>
            ) : null}
            O endereço anterior fica guardado no histórico, não é apagado.
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
                        opcoes={ruasSugeridas}
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

export default TrocarEndereco
