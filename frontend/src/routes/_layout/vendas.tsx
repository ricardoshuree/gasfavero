// [mcp-local harness] feature: ajustes-endereco-card-mes-data-vale | plano: 15362128 | 2026-08-05 21:55:56
// Data a ser pago do vale pre-preenchida com hoje+30 dias
// [mcp-local harness] feature: ajustes-endereco-card-mes-data-vale | plano: 15362128
// "Data a ser pago" do vale pre-preenchida com hoje+30 dias (so preenche
// se ainda estiver vazio, nao sobrescreve edicao manual) -- se o usuario
// limpar o campo, mantem a regra existente: backend calcula o 5o dia
// util do mes seguinte automaticamente.
// [mcp-local harness] feature: ajustes-cosmeticos-vendas | plano: 8c042ce9 | 2026-08-05 11:34:03
// Sugere automaticamente o proximo numero de vale do bloco do motorista selecionado
// [mcp-local harness] feature: fluxo-vendas-distribuidora-frontend | plano: b8adcd52
// Pagina /vendas -- dashboard de venda de balcao da distribuidora (item 7
// da lista de requisitos). Gate via modulo 'vendas'.
//
// [mcp-local harness] fix: onError tipado explicitamente como ApiError
// (em vez de cast `as never`) -- mais limpo e consistente com o
// restante do projeto.
//
// [mcp-local harness] feature: ajustes-cosmeticos-vendas | plano: 8c042ce9
// Ao selecionar "Vale", sugere automaticamente o proximo numero livre
// do bloco do motorista selecionado (continua editavel)
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import {
  type ApiError,
  type ClientePublic,
  type EnderecoPublic,
  PrecosService,
  type ProdutoComPrecoPublic,
  UsersService,
  VendasService,
} from "@/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import ClienteSection from "@/components/Vendas/ClienteSection"
import FormaPagamento, {
  type FormaPagamentoValue,
} from "@/components/Vendas/FormaPagamento"
import ProdutoGrid from "@/components/Vendas/ProdutoGrid"
import ResumoVendaDialog from "@/components/Vendas/ResumoVendaDialog"
import Sacola, { type SacolaItem } from "@/components/Vendas/Sacola"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

const MODULE = "vendas"
const NOME_DISTRIBUIDORA = "Distribuidora Gás Favero"

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** ISO (yyyy-mm-dd) + N dias corridos, também em ISO. */
function somarDiasISO(isoDate: string, dias: number): string {
  const d = new Date(`${isoDate}T00:00:00`)
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

export const Route = createFileRoute("/_layout/vendas")({
  component: Vendas,
  beforeLoad: async () => {
    const perms = await UsersService.readUserPermissions()
    const canRead =
      perms.is_superuser ||
      perms.permissions.some((p) => p.module === MODULE && p.can_read)
    if (!canRead) {
      throw redirect({ to: "/" })
    }
  },
  head: () => ({
    meta: [{ title: "Vendas - FastAPI Template" }],
  }),
})

function Vendas() {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const [sacola, setSacola] = useState<SacolaItem[]>([])
  const [cliente, setCliente] = useState<ClientePublic | null>(null)
  const [endereco, setEndereco] = useState<EnderecoPublic | null>(null)
  const [motoristaId, setMotoristaId] = useState("")
  const [formaPagamento, setFormaPagamento] =
    useState<FormaPagamentoValue | null>(null)
  const [valeNumero, setValeNumero] = useState("")
  const [dataPagamentoVale, setDataPagamentoVale] = useState("")
  const [valorPago, setValorPago] = useState("")
  const [valorPagoManual, setValorPagoManual] = useState(false)
  const [dataVenda, setDataVenda] = useState(hojeISO())
  const [showResumo, setShowResumo] = useState(false)

  const { data: produtosComPreco } = useQuery({
    queryKey: ["precos"],
    queryFn: () => PrecosService.readPrecos(),
  })
  const produtos: ProdutoComPrecoPublic[] = produtosComPreco?.data ?? []

  const { data: users } = useQuery({
    queryKey: ["users", "vendas"],
    queryFn: () => UsersService.readUsers({ limit: 100 }),
  })

  // Default do combo de motorista = "Distribuidora Gás Favero"
  useEffect(() => {
    if (motoristaId || !users) return
    const distribuidora = users.data.find(
      (u) => u.full_name === NOME_DISTRIBUIDORA,
    )
    if (distribuidora) setMotoristaId(distribuidora.id)
  }, [users, motoristaId])

  // Ao escolher "Vale", sugere o próximo número livre do bloco do
  // motorista selecionado -- só preenche se o campo ainda estiver
  // vazio (não sobrescreve o que o usuário já digitou).
  useEffect(() => {
    if (formaPagamento !== "vale" || !motoristaId) return
    VendasService.readProximoNumeroVale({ motoristaId })
      .then((res) => {
        if (res.numero == null) return
        setValeNumero((atual) => (atual ? atual : String(res.numero)))
      })
      .catch(() => {})
  }, [formaPagamento, motoristaId])

  // Ao escolher "Vale", pré-preenche "Data a ser pago" com hoje + 30
  // dias -- só se o campo ainda estiver vazio (não sobrescreve edição
  // manual). Se o usuário limpar o campo de propósito, o backend
  // continua calculando o 5º dia útil do mês seguinte automaticamente.
  useEffect(() => {
    if (formaPagamento !== "vale") return
    setDataPagamentoVale((atual) =>
      atual ? atual : somarDiasISO(hojeISO(), 30),
    )
  }, [formaPagamento])

  const total = sacola.reduce(
    (acc, item) => acc + Number(item.precoUnitario) * item.quantidade,
    0,
  )

  // Valor pago acompanha o total até o usuário editar manualmente
  useEffect(() => {
    if (!valorPagoManual) setValorPago(total > 0 ? total.toFixed(2) : "")
  }, [total, valorPagoManual])

  const quantidadesNaSacola = Object.fromEntries(
    sacola.map((i) => [i.produtoId, i.quantidade]),
  )

  const handleSelectProduto = (produto: ProdutoComPrecoPublic) => {
    if (!produto.preco_atual) return
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
          precoUnitario: produto.preco_atual as string,
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
    setSacola([])
    setCliente(null)
    setEndereco(null)
    setFormaPagamento(null)
    setValeNumero("")
    setDataPagamentoVale("")
    setValorPago("")
    setValorPagoManual(false)
    setDataVenda(hojeISO())
    // motoristaId mantém o valor atual (geralmente a Distribuidora),
    // pronto pra próxima venda
  }

  const mutation = useMutation({
    mutationFn: () =>
      VendasService.createVenda({
        requestBody: {
          cliente_id: cliente?.id ?? "",
          endereco_id: endereco?.id,
          motorista_id: motoristaId,
          forma_pagamento: formaPagamento as
            | "cartao_debito" | "cartao_credito" | "pix" | "dinheiro" | "vale",
          vale_numero:
            formaPagamento === "vale" && valeNumero
              ? Number(valeNumero)
              : undefined,
          data_pagamento_vale:
            formaPagamento === "vale" && dataPagamentoVale
              ? dataPagamentoVale
              : undefined,
          valor_pago: valorPago,
          data_venda: dataVenda,
          itens: sacola.map((i) => ({
            produto_id: i.produtoId,
            quantidade: i.quantidade,
          })),
        },
      }),
    onSuccess: () => {
      showSuccessToast("Venda registrada com sucesso")
      setShowResumo(false)
      resetForm()
    },
    onError: (err: ApiError) => {
      handleError.call(showErrorToast, err)
      setShowResumo(false)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["vales"] })
      queryClient.invalidateQueries({ queryKey: ["blocosVale"] })
    },
  })

  const podeFinalizar =
    !!cliente &&
    sacola.length > 0 &&
    !!motoristaId &&
    !!formaPagamento &&
    (formaPagamento !== "vale" || valeNumero.trim().length > 0)

  const handleAbrirResumo = () => {
    if (!cliente) return showErrorToast("Selecione ou cadastre um cliente")
    if (sacola.length === 0)
      return showErrorToast("Adicione ao menos 1 produto na sacola")
    if (!formaPagamento) return showErrorToast("Selecione a forma de pagamento")
    if (formaPagamento === "vale" && !valeNumero.trim())
      return showErrorToast("Informe o número do vale")
    setShowResumo(true)
  }

  const motoristaNome =
    users?.data.find((u) => u.id === motoristaId)?.full_name ||
    users?.data.find((u) => u.id === motoristaId)?.email ||
    ""

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vendas</h1>
        <p className="text-muted-foreground">
          Venda de balcão da distribuidora
        </p>
      </div>

      <div className="grid gap-1.5 max-w-sm">
        <Label>Atribuir venda a</Label>
        <Select value={motoristaId} onValueChange={setMotoristaId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
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
          <p className="mb-2 text-sm font-medium">Sacola</p>
          <Sacola
            itens={sacola}
            onIncrementar={handleIncrementar}
            onDecrementar={handleDecrementar}
            onRemover={handleRemover}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium">Cliente</p>
          <ClienteSection
            cliente={cliente}
            onClienteChange={setCliente}
            enderecoSelecionado={endereco}
            onEnderecoChange={setEndereco}
          />
        </div>
        <div>
          <FormaPagamento
            value={formaPagamento}
            onChange={setFormaPagamento}
            valeNumero={valeNumero}
            onValeNumeroChange={setValeNumero}
            dataPagamentoVale={dataPagamentoVale}
            onDataPagamentoValeChange={setDataPagamentoVale}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-lg border p-3 sm:max-w-md">
        <div className="grid gap-1.5">
          <Label htmlFor="valor-pago">PAGO (R$)</Label>
          <Input
            id="valor-pago"
            type="text"
            inputMode="decimal"
            value={valorPago}
            onChange={(e) => {
              setValorPago(e.target.value)
              setValorPagoManual(true)
            }}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="data-venda">Data</Label>
          <Input
            id="data-venda"
            type="date"
            value={dataVenda}
            onChange={(e) => setDataVenda(e.target.value)}
          />
        </div>
      </div>

      <div className="sticky bottom-4 flex justify-end">
        <Button size="lg" disabled={!podeFinalizar} onClick={handleAbrirResumo}>
          Finalizar Venda
        </Button>
      </div>

      <ResumoVendaDialog
        open={showResumo}
        onOpenChange={setShowResumo}
        clienteNome={cliente?.nome ?? ""}
        endereco={endereco}
        motoristaNome={motoristaNome}
        itens={sacola}
        formaPagamento={formaPagamento ?? ""}
        valeNumero={valeNumero}
        dataPagamentoVale={dataPagamentoVale}
        valorPago={valorPago}
        dataVenda={dataVenda}
        isPending={mutation.isPending}
        onConfirm={() => mutation.mutate()}
      />
    </div>
  )
}

