// [mcp-local harness] feature: clientes-precos-vales-frontend | plano: 5db64e4b | 2026-08-05 07:48:37
// Remove z.coerce.number() (causava erro de tipo no resolver), usa string+regex e converte no submit; corrige u.roles opcional
// [mcp-local harness] feature: clientes-precos-vales-frontend | plano: 5db64e4b | 2026-08-04 23:35:01
// Dialog de criacao de Bloco de Vale ja com o motorista atribuido no mesmo formulario
//
// [mcp-local harness] fix: z.coerce.number() nao-opcional gera um
// mismatch de tipos entre o "input" do resolver (unknown) e o "output"
// (number) que o TS rejeita com zodResolver + react-hook-form nessa
// versao. Troquei por string validada por regex e converto pra number
// só no onSubmit -- schema fica com input/output identicos (string),
// sem ambiguidade de tipo.
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { type BlocoValeCreate, UsersService, ValesService } from "@/client"
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

const numeroFolhaSchema = z
  .string()
  .min(1, { message: "Informe um número" })
  .regex(/^\d+$/, { message: "Informe um número válido" })

const formSchema = z
  .object({
    motorista_id: z.string().min(1, { message: "Selecione um motorista" }),
    primeira_folha: numeroFolhaSchema,
    ultima_folha: numeroFolhaSchema,
  })
  .refine((data) => Number(data.ultima_folha) >= Number(data.primeira_folha), {
    message: "A última folha deve ser maior ou igual à primeira",
    path: ["ultima_folha"],
  })

type FormData = z.infer<typeof formSchema>

const AddBlocoVale = () => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      motorista_id: "",
      primeira_folha: "",
      ultima_folha: "",
    },
  })

  const { data: users } = useQuery({
    queryKey: ["users", "for-bloco-vale"],
    queryFn: () => UsersService.readUsers({ limit: 100 }),
    enabled: isOpen,
  })

  const mutation = useMutation({
    mutationFn: (data: BlocoValeCreate) =>
      ValesService.createBlocoVale({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("Bloco de fiado criado com sucesso")
      form.reset()
      setIsOpen(false)
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["blocosVale"] })
    },
  })

  const onSubmit = (data: FormData) => {
    mutation.mutate({
      motorista_id: data.motorista_id,
      primeira_folha: Number(data.primeira_folha),
      ultima_folha: Number(data.ultima_folha),
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2" />
          Novo Bloco de Fiado
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Bloco de Fiado</DialogTitle>
          <DialogDescription>
            Informe a primeira e a última folha do bloco -- um fiado é gerado pra
            cada número da sequência. O motorista escolhido aqui fica fixo: não
            é possível reatribuir o bloco depois.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-4 py-4">
              <FormField
                control={form.control}
                name="motorista_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Motorista <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecione o motorista" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {users?.data.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.full_name || u.email}
                            {u.roles && u.roles.length > 0
                              ? ` (${u.roles.join(", ")})`
                              : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="primeira_folha"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Primeira folha{" "}
                        <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          inputMode="numeric"
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
                  name="ultima_folha"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Última folha <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          inputMode="numeric"
                          {...field}
                          required
                        />
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

export default AddBlocoVale
