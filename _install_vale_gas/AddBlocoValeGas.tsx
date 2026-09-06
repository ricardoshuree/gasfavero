import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Search } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

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

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"

const numeroFolhaSchema = z
  .string()
  .min(1, { message: "Informe um número" })
  .regex(/^\d+$/, { message: "Somente números" })

const formSchema = z
  .object({
    cliente_id: z.string().min(1, { message: "Selecione um estabelecimento" }),
    primeira_folha: numeroFolhaSchema,
    ultima_folha: numeroFolhaSchema,
    data: z.string().min(1, { message: "Informe a data" }),
  })
  .refine((d) => Number(d.ultima_folha) >= Number(d.primeira_folha), {
    message: "A última folha deve ser maior ou igual à primeira",
    path: ["ultima_folha"],
  })

type FormData = z.infer<typeof formSchema>

interface ClienteResult {
  id: string
  nome: string
  cpf: string
}

const AddBlocoValeGas = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [buscaCpf, setBuscaCpf] = useState("")
  const [resultados, setResultados] = useState<ClienteResult[]>([])
  const [clienteSelecionado, setClienteSelecionado] = useState<ClienteResult | null>(null)
  const [buscando, setBuscando] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cliente_id: "",
      primeira_folha: "",
      ultima_folha: "",
      data: new Date().toISOString().split("T")[0],
    },
  })

  async function buscarCliente() {
    if (!buscaCpf.trim()) return
    setBuscando(true)
    setResultados([])
    try {
      const token = localStorage.getItem("access_token")
      const res = await fetch(
        `${API}/api/v1/vale-gas/clientes/busca?cpf=${encodeURIComponent(buscaCpf)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) throw new Error("Erro na busca")
      const data: ClienteResult[] = await res.json()
      setResultados(data)
    } catch {
      showErrorToast("Erro ao buscar estabelecimento")
    } finally {
      setBuscando(false)
    }
  }

  function selecionarCliente(c: ClienteResult) {
    setClienteSelecionado(c)
    form.setValue("cliente_id", c.id)
    setResultados([])
  }

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const token = localStorage.getItem("access_token")
      const res = await fetch(`${API}/api/v1/vale-gas/blocos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          cliente_id: data.cliente_id,
          primeira_folha: Number(data.primeira_folha),
          ultima_folha: Number(data.ultima_folha),
          data: data.data,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || "Erro ao criar bloco")
      }
      return res.json()
    },
    onSuccess: () => {
      showSuccessToast("Bloco de Vale Gás criado com sucesso")
      form.reset()
      setClienteSelecionado(null)
      setBuscaCpf("")
      setIsOpen(false)
      queryClient.invalidateQueries({ queryKey: ["blocosValeGas"] })
    },
    onError: (e: Error) => showErrorToast(e.message),
  })

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2" />
          Novo Bloco de Vale Gás
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Bloco de Vale Gás</DialogTitle>
          <DialogDescription>
            Associe um estabelecimento comercial (supermercado, farmácia etc.)
            ao intervalo de folhas do talão impresso pela gráfica.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))}>
            <div className="grid gap-4 py-4">

              {/* Busca de estabelecimento por CNPJ/CPF */}
              <div className="grid gap-1.5">
                <FormLabel>Estabelecimento (CNPJ / CPF)</FormLabel>
                {clienteSelecionado ? (
                  <div className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{clienteSelecionado.nome}</p>
                      <p className="text-xs text-muted-foreground">{clienteSelecionado.cpf}</p>
                    </div>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline"
                      onClick={() => {
                        setClienteSelecionado(null)
                        form.setValue("cliente_id", "")
                      }}
                    >
                      trocar
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Digite CNPJ ou CPF..."
                        value={buscaCpf}
                        onChange={(e) => setBuscaCpf(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), buscarCliente())}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={buscando}
                        onClick={buscarCliente}
                      >
                        <Search className="h-4 w-4" />
                      </Button>
                    </div>
                    {resultados.length > 0 && (
                      <div className="rounded-md border divide-y">
                        {resultados.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-muted transition-colors"
                            onClick={() => selecionarCliente(c)}
                          >
                            <p className="text-sm font-medium">{c.nome}</p>
                            <p className="text-xs text-muted-foreground">{c.cpf}</p>
                          </button>
                        ))}
                      </div>
                    )}
                    {resultados.length === 0 && buscaCpf && !buscando && (
                      <p className="text-xs text-muted-foreground">
                        Nenhum resultado — cadastre o estabelecimento em Clientes primeiro.
                      </p>
                    )}
                  </>
                )}
                <FormMessage>{form.formState.errors.cliente_id?.message}</FormMessage>
              </div>

              {/* Intervalo de folhas */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="primeira_folha"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Primeira folha <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input type="number" min={1} inputMode="numeric" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="ultima_folha"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Última folha <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input type="number" min={1} inputMode="numeric" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Data de circulação */}
              <FormField
                control={form.control}
                name="data"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de circulação <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={mutation.isPending}>Cancelar</Button>
              </DialogClose>
              <LoadingButton type="submit" loading={mutation.isPending}>Salvar</LoadingButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default AddBlocoValeGas
