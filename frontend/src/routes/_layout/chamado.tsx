// [mcp-local harness] feature: chamado-tela | plano: 4507b69c | 2026-08-07 07:58:43
// Tela /chamado -- despacho de entrega pelo atendente
// Página /chamado -- gate via módulo "delegacao" (mesmo módulo dos
// endpoints de demandas-venda/motoristas, já em uso desde a Fase 1).
//
// Tela onde o atendente (na distribuidora) despacha um chamado assim
// que um cliente liga pedindo entrega -- nome, CPF/CNPJ opcional
// (carrega se já cadastrado), endereço OBRIGATÓRIO (autoload do
// último endereço usado numa venda desse cliente, igual à tela de
// Vendas), produtos via os mesmos botões de ícone da tela de Vendas,
// campo de observação livre, e o motorista: um específico ou "aberto"
// pra qualquer motorista disponível aceitar (motorista_id omitido).
//
// Reaproveita ClienteSection, ProdutoGrid e Sacola da tela de Vendas
// tal como estão -- o fluxo de buscar/cadastrar cliente e escolher
// produtos é idêntico, não faz sentido duplicar.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { useState } from "react"

import {
  type ApiError,
  type ClientePublic,
  DelegacaoService,
  type EnderecoPublic,
  PrecosService,
  type ProdutoComPrecoPublic,
  UsersService,
} from "@/client"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import ClienteSection from "@/components/Vendas/ClienteSection"
import ProdutoGrid from "@/components/Vendas/ProdutoGrid"
import Sacola, { type SacolaItem } from "@/components/Vendas/Sacola"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

const MODULE = "delegacao"

// Sentinela pro <Select> -- Radix não aceita value="" em SelectItem,
// então usamos essa string pra representar "sem motorista específico"
// e traduzimos pra undefined na hora de montar o corpo da requisição.
const QUALQUER_MOTORISTA = "__qualquer__"

export const Route = createFileRoute("/_layout/chamado")({
  component: Chamado,
  beforeLoad: async () => {
    const perms = await UsersService.readUserPermissions()
    const canCreate =
      perms.is_superuser ||
      perms.permissions.some((p) => p.module === MODULE && p.can_create)
    if (!canCreate) {
      throw redirect({ to: "/" })
    }
  },
  head: () => ({
    meta: [{ title: "Chamado - FastAPI Template" }],
  }),
})

function Chamado() {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const [cliente, setCliente] = useState<ClientePublic | null>(null)
  const [endereco, setEndereco] = useState<EnderecoPublic | null>(null)
  const [sacola, setSacola] = useState<SacolaItem[]>([])
  const [motoristaId, setMotoristaId] = useState(QUALQUER_MOTORISTA)
  const [observacao, setObservacao] = useState("")

  const { data: produtosComPreco } = useQuery({
    queryKey: ["precos"],
    queryFn: () => PrecosService.readPrecos(),
  })
  const produtos: ProdutoComPrecoPublic[] = produtosComPreco?.data ?? []

  const { data: users } = useQuery({
    queryKey: ["users", "chamado"],
    queryFn: () => UsersService.readUsers({ limit: 100 }),
  })

  const quantidadesNaSacola = Object.fromEntries(
    sacola.map((i) => [i.produtoId, i.quantidade]),
  )

  const handleSelectProduto = (produto: ProdutoComPrecoPublic) => {
    setSacola((prev) => {
      const existente = prev.find((i) => i.produtoId === produto.id)
      if (existente) {
        return prev.map((i) =>
          i.produtoId === produto.id
            ? { ...i, quantidade: i.quantidade + 1 }
            : i,
        )
      }
      return [
        ...prev,
        {
          produtoId: produto.id,
          title: produto.title,
          precoUnitario: produto.preco_atual ?? "0",
          quantidade: 1,
        },
      ]
    })
  }

  const handleIncrementar = (produtoId: string) =>
    setSacola((prev) =>
      prev.map((i) =>
        i.produtoId === produtoId ? { ...i, quantidade: i.quantidade + 1 } : i,
      ),
    )

  const handleDecrementar = (produtoId: string) =>
    setSacola((prev) =>
      prev.flatMap((i) => {
        if (i.produtoId !== produtoId) return [i]
        if (i.quantidade <= 1) return []
        return [{ ...i, quantidade: i.quantidade - 1 }]
      }),
    )

  const handleRemover = (produtoId: string) =>
    setSacola((prev) => prev.filter((i) => i.produtoId !== produtoId))

  const resetForm = () => {
    setCliente(null)
    setEndereco(null)
    setSacola([])
    setMotoristaId(QUALQUER_MOTORISTA)
    setObservacao("")
  }

  const mutation = useMutation({
    mutationFn: () =>
      DelegacaoService.createDemandaVenda({
        requestBody: {
          cliente_id: cliente?.id ?? "",
          endereco_id: endereco?.id ?? "",
          motorista_id:
            motoristaId === QUALQUER_MOTORISTA ? undefined : motoristaId,
          observacao: observacao.trim() || undefined,
          itens: sacola.map((i) => ({
            produto_id: i.produtoId,
            quantidade: i.quantidade,
          })),
        },
      }),
    onSuccess: () => {
      showSuccessToast("Chamado despachado com sucesso")
      resetForm()
    },
    onError: (err: ApiError) => handleError.call(showErrorToast, err),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["demandasVenda"] })
    },
  })

  const podeDespachar = !!cliente && !!endereco

  const handleDespachar = () => {
    if (!cliente) return showErrorToast("Selecione ou cadastre um cliente")
    if (!endereco) return showErrorToast("Endereço é obrigatório")
    mutation.mutate()
  }

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Chamado</h1>
        <p className="text-muted-foreground">
          Cliente ligou pedindo entrega -- despache um motorista específico
          ou deixe aberto pra qualquer um disponível aceitar.
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Cliente</p>
        <ClienteSection
          cliente={cliente}
          onClienteChange={setCliente}
          enderecoSelecionado={endereco}
          onEnderecoChange={setEndereco}
        />
        {!endereco && (
          <p className="mt-1 text-xs text-destructive">
            Endereço é obrigatório pra um chamado -- sem isso não dá pra
            plotar no mapa.
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <p className="mb-2 text-sm font-medium">Produtos</p>
          <ProdutoGrid
            produtos={produtos}
            quantidadesNaSacola={quantidadesNaSacola}
            onSelect={handleSelectProduto}
          />
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Itens do chamado</p>
          <Sacola
            itens={sacola}
            onIncrementar={handleIncrementar}
            onDecrementar={handleDecrementar}
            onRemover={handleRemover}
          />
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>Motorista</Label>
          <Select value={motoristaId} onValueChange={setMotoristaId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={QUALQUER_MOTORISTA}>
                Qualquer motorista disponível
              </SelectItem>
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
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="chamado-obs">Observação</Label>
          <Textarea
            id="chamado-obs"
            placeholder="Ex: Em frente à Rádio Veranense, portão azul..."
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
        </div>
      </div>

      <div className="sticky bottom-4 flex justify-end">
        <Button
          size="lg"
          disabled={!podeDespachar || mutation.isPending}
          onClick={handleDespachar}
        >
          Despachar Chamado
        </Button>
      </div>
    </div>
  )
}

export default Chamado
