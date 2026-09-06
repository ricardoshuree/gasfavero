// [mcp-local harness] feature: venda-vale-gas | plano: 5e65e659 | 2026-09-05 21:39:08
// Adiciona estado valeGasNumero e valeGasBlocoId, passa para FormaPagamento, inclui no VendaCreate e na validacao podeFinalizar
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
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamentoValue | null>(null)
  // Fiado
  const [valeNumero, setValeNumero] = useState("")
  const [dataPagamentoVale, setDataPagamentoVale] = useState("")
  // Vale Gas
  const [valeGasNumero, setValeGasNumero] = useState("")
  const [valeGasBlocoId, setValeGasBlocoId] = useState<string | null>(null)
  // Pagamento
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

  // Default motorista = Distribuidora Gás Favero
  useEffect(() => {
    if (motoristaId || !users) return
    const distribuidora = users.data.find((u) => u.full_name === NOME_DISTRIBUIDORA)
    if (distribuidora) setMotoristaId(distribuidora.id)
  }, [users, motoristaId])

  // Ao escolher "Fiado", sugere próximo número livre do bloco do motorista
  useEffect(() => {
    if (formaPagamento !== "vale" || !motoristaId) return
    VendasService.readProximoNumeroVale({ motoristaId })
      .then((res) => {
        if (res.numero == null) return
        setValeNumero((atual) => (atual ? atual : String(res.numero)))
      })
      .catch(() => {})
  }, [formaPagamento, motoristaId])

  // Ao escolher "Fiado", pré-preenche data com hoje+30 dias
  useEffect(() => {
    if (formaPagamento !== "vale") return
    setDataPagamentoVale((atual) => atual ? atual : somarDiasISO(hojeISO(), 30))
  }, [formaPagamento])

  const total = sacola.reduce(
    (acc, item) => acc + Number(item.precoUnitario) * item.quantidade,
    0,
  )

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
          i.produtoId === produto.id ? { ...i, quantidade: i.quantidade + 1 } : i,
        )
      }
      return [...prev, { produtoId: produto.id, title: produto.title, precoUnitario: produto.preco_atual as string, quantidade: 1 }]
    })
  }

  const handleIncrementar = (produtoId: string) =>
    setSacola((prev) => prev.map((i) => i.produtoId === produtoId ? { ...i, quantidade: i.quantidade + 1 } : i))

  const handleDecrementar = (produtoId: string) =>
    setSacola((prev) => prev.flatMap((i) => {
      if (i.produtoId !== produtoId) return [i]
      if (i.quantidade <= 1) return []
      return [{ ...i, quantidade: i.quantidade - 1 }]
    }))

  const handleRemover = (produtoId: string) =>
    setSacola((prev) => prev.filter((i) => i.produtoId !== produtoId))

  const resetForm = () => {
    setSacola([])
    setCliente(null)
    setEndereco(null)
    setFormaPagamento(null)
    setValeNumero("")
    setDataPagamentoVale("")
    setValeGasNumero("")
    setValeGasBlocoId(null)
    setValorPago("")
    setValorPagoManual(false)
    setDataVenda(hojeISO())
  }

  const mutation = useMutation({
    mutationFn: () =>
      VendasService.createVenda({
        requestBody: {
          cliente_id: cliente?.id ?? "",
          endereco_id: endereco?.id,
          motorista_id: motoristaId,
          forma_pagamento: formaPagamento as
            | "cartao_debito" | "cartao_credito" | "pix" | "dinheiro" | "vale" | "vale_gas",
          // Fiado
          vale_numero: formaPagamento === "vale" && valeNumero ? Number(valeNumero) : undefined,
          data_pagamento_vale: formaPagamento === "vale" && dataPagamentoVale ? dataPagamentoVale : undefined,
          // Vale Gas
          vale_gas_numero: formaPagamento === "vale_gas" && valeGasNumero ? Number(valeGasNumero) : undefined,
          vale_gas_bloco_id: formaPagamento === "vale_gas" ? (valeGasBlocoId ?? undefined) : undefined,
          valor_pago: valorPago,
          data_venda: dataVenda,
          itens: sacola.map((i) => ({ produto_id: i.produtoId, quantidade: i.quantidade })),
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
    (formaPagamento !== "vale" || valeNumero.trim().length > 0) &&
    // Vale Gas: exige numero valido (bloco_id preenchido pelo validador)
    (formaPagamento !== "vale_gas" || (valeGasNumero.trim().length > 0 && !!valeGasBlocoId))

  const handleAbrirResumo = () => {
    if (!cliente) return showErrorToast("Selecione ou cadastre um cliente")
    if (sacola.length === 0) return showErrorToast("Adicione ao menos 1 produto na sacola")
    if (!formaPagamento) return showErrorToast("Selecione a forma de pagamento")
    if (formaPagamento === "vale" && !valeNumero.trim()) return showErrorToast("Informe o número do fiado")
    if (formaPagamento === "vale_gas" && !valeGasNumero.trim()) return showErrorToast("Informe o número do vale gás")
    if (formaPagamento === "vale_gas" && !valeGasBlocoId) return showErrorToast("Número de vale gás inválido — verifique o estabelecimento")
    setShowResumo(true)
  }

  const motoristaNome =
    users?.data.find((u) => u.id === motoristaId)?.full_name ||
    users?.data.find((u) => u.id === motoristaId)?.email || ""

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vendas</h1>
        <p className="text-muted-foreground">Venda de balcão da distribuidora</p>
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
                {u.roles && u.roles.length > 0 ? ` (${u.roles.join(", ")})` : ""}
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
            valeGasNumero={valeGasNumero}
            onValeGasNumeroChange={setValeGasNumero}
            onValeGasBlocoIdChange={setValeGasBlocoId}
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
