// [mcp-local harness] feature: logradouros-referencia-autocomplete | plano: f032de2c | 2026-08-06 15:47:01
// Substitui useQuery(ruas) por useSugestoesRua(bairroId)
// [mcp-local harness] feature: logradouros-referencia-autocomplete
// Troca useQuery(ruas) local por useSugestoesRua (mescla ruas do
// bairro + catalogo de referencia da cidade)
//
// [mcp-local harness] feature: ajustes-cosmeticos-vendas | plano: 8c042ce9 | 2026-08-05 11:34:37
// CPF/CNPJ label, mascara telefone, RuaAutocomplete
// [mcp-local harness] feature: clientes-precos-vales-frontend | plano: 5db64e4b | 2026-08-04 23:32:36
// Dialog de criacao de Cliente + Endereco, com select de bairro e input de rua com sugestoes (datalist)
//
// [mcp-local harness] fix: BairrosService -> GeografiaService (a tag do
// router geografia.py e "geografia", entao o gerador usa esse nome pra
// classe do servico, nao o prefixo da URL "/bairros")
//
// [mcp-local harness] feature: fluxo-vendas-distribuidora-frontend | plano: b8adcd52
// Adiciona campo telefone (opcional). Endereco continua obrigatorio
// nesta tela (decisao do Ricardo -- so a tela de Venda tem endereco
// opcional).
//
// [mcp-local harness] feature: ajustes-cosmeticos-vendas | plano: 8c042ce9
// Label "CPF" -> "CPF/CNPJ", mascara de telefone com (54) padrao,
// RuaAutocomplete no lugar do datalist nativo
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { type ClienteCreate, ClientesService, GeografiaService } from "@/client"
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

/** Formata dígitos como "(54) 99999-9999" progressivamente. */
function formatTelefone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11)
  if (d.length === 0) return ""
  if (d.length <= 2) return `(${d}${d.length === 2 ? ") " : ""}`
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

const formSchema = z.object({
  nome: z.string().min(1, { message: "Nome é obrigatório" }),
  cpf: z.string().min(11, { message: "CPF/CNPJ inválido" }),
  telefone: z.string().optional(),
  bairro_id: z.string().min(1, { message: "Selecione um bairro" }),
  rua_nome: z.string().min(1, { message: "Rua é obrigatória" }),
  numero: z.string().min(1, { message: "Número é obrigatório" }),
  complemento: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

const AddCliente = () => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      nome: "",
      cpf: "",
      telefone: formatTelefone("54"),
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
  })

  // Sugestões de rua: mescla o que já foi cadastrado nesse bairro com
  // o catálogo de referência da cidade (ver useSugestoesRua) -- não é
  // uma lista fechada, o campo continua sendo texto livre (ver
  // EnderecoCreate.rua_nome, "cresce por uso").
  const { opcoes: ruasSugeridas } = useSugestoesRua(bairroId)

  const mutation = useMutation({
    mutationFn: (data: ClienteCreate) =>
      ClientesService.createCliente({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("Cliente cadastrado com sucesso")
      form.reset()
      setIsOpen(false)
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] })
    },
  })

  const onSubmit = (data: FormData) => {
    const telefoneDigits = (data.telefone || "").replace(/\D/g, "")
    mutation.mutate({
      nome: data.nome,
      cpf: data.cpf,
      telefone: telefoneDigits.length > 2 ? data.telefone : undefined,
      endereco: {
        bairro_id: data.bairro_id,
        rua_nome: data.rua_nome,
        numero: data.numero,
        complemento: data.complemento || undefined,
      },
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2" />
          Novo Cliente
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Cliente</DialogTitle>
          <DialogDescription>
            Cadastra o cliente já com o endereço. Se a rua não estiver na lista
            de sugestões, é só digitar o nome -- ela é cadastrada na hora.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
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
                        <Input
                          placeholder="000.000.000-00"
                          type="text"
                          {...field}
                          required
                        />
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
                        <Input
                          placeholder="(54) 99999-9999"
                          type="text"
                          {...field}
                          onChange={(e) =>
                            field.onChange(formatTelefone(e.target.value))
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

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

export default AddCliente
