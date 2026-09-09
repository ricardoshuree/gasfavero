// [mcp-local harness] feature: vendas_layout_otimizado | plano: 45d0bc3d | 2026-09-09 14:00:50
// Layout otimizado: grid 2 colunas com Cliente|Sacola, Produtos|Empréstimo, FormaPgto|Valor+Data, vazio|Total+Finalizar
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
import PainelCasco, { type CascoItem } from "@/components/Vendas/PainelCasco"
import ProdutoGrid from "@/components/Vendas/ProdutoGrid"
import ResumoVendaDialog from "@/components/Vendas/ResumoVendaDialog"
import Sacola, { type SacolaItem } from "@/components/Vendas/Sacola"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

const MODULE = "vendas"
const NOME_DISTRIBUIDORA = "Distribuidora Gás Favero"
const ROLES_PERMITIDAS = ["gerente", "motorista"]

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function somarDiasISO(isoDate: string, dias: number): string {
  const d = new Date(`${isoDate}T00:00:00`)
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

function formatMoney(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
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
  const [cascos, setCascos] = useState<CascoItem[]>([])
  const [cliente, setCliente] = useState<ClientePublic | null>(null)
  const [endereco, setEndereco] = useState<EnderecoPublic | null>(null)
  const [motoristaId, setMotoristaId] = useState("")
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamentoValue | null>(null)
  const [valeNumero, setValeNumero] = useState("")
  const [dataPagamentoVale, setDataPagamentoVale] = useState("")
  const [valeGasNumero, setValeGasNumero] = useState("")
  const [valeGasBlocoId, setValeGasBlocoId] = useState<string | null>(null)
  const [gasPovoValorGov, setGasPovoValorGov] = useState("")
  const [gasPovoFrete, setGasPovoFrete] = useState("")
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

  const usuariosCombo = (users?.data ?? []).filter((u) =>
    u.full_name === NOME_DISTRIBUIDORA ||
    (u.roles ?? []).some((r) => ROLES_PERMITIDAS.includes(r.toLowerCase()))
  )

  useEffect(() => {
    if (motoristaId || !users) return
    const distribuidora = users.data.find((u) => u.full_name === NOME_DISTRIBUIDORA)
    if (distribuidora) setMotoristaId(distribuidora.id)
  }, [users, motoristaId])

  useEffect(() => {
    if (formaPagamento !== "vale" || !motoristaId) return
    VendasService.readProximoNumeroVale({ motoristaId })
      .then((res) => {
        if (res.numero == null) return
        setValeNumero((atual) => (atual ? atual : String(res.numero)))
      })
      .catch(() => {})
  }, [formaPagamento, motoristaId])

  useEffect(() => {
    if (formaPagamento !== "vale") return
    setDataPagamentoVale((atual) => atual ? atual : somarDiasISO(hojeISO(), 30))
  }, [formaPagamento])

  const total = sacola.reduce((acc, item) => {
    const gas = Number(item.precoUnitario) * item.quantidade
    const casco = item.comCasco && item.precoCascoAtual
      ? Number(item.precoCascoAtual) * item.quantidade
      : 0
    return acc + gas + casco
  }, 0)

  useEffect(() => {
    if (formaPagamento === "gas_povo") {
      setValorPago(gasPovoValorGov)
      return
    }
    if (!valorPagoManual) setValorPago(total > 0 ? total.toFixed(2) : "")
  }, [total, valorPagoManual, formaPagamento, gasPovoValorGov])

  useEffect(() => {
    if (formaPagamento !== "gas_povo") {
      setGasPovoValorGov("")
      setGasPovoFrete("")
    }
  }, [formaPagamento])

  useEffect(() => {
    const idsNaSacola = new Set(sacola.map((i) => i.produtoId))
    setCascos((prev) => prev.filter((c) => idsNaSacola.has(c.produto_id)))
  }, [sacola])

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
      return [
        ...prev,
        {
          produtoId: produto.id,
          title: produto.title,
          precoUnitario: produto.preco_atual as string,
          quantidade: 1,
          vendeCasco: produto.vende_casco ?? false,
          precoCascoAtual: produto.preco_casco_atual ?? null,
          comCasco: false,
        },
      ]
    })
  }

  const handleIncrementar = (produtoId: string) =>
    setSacola((prev) => prev.map((i) => i.produtoId === produtoId ? { ...i, quantidade: i.quantidade + 1 } : i))

  const handleDecrementar = (produtoId: string) => {
    setSacola((prev) => prev.flatMap((i) => {
      if (i.produtoId !== produtoId) return [i]
      if (i.quantidade <= 1) return []
      return [{ ...i, quantidade: i.quantidade - 1 }]
    }))
    setCascos((prev) => prev.map((c) => {
      if (c.produto_id !== produtoId) return c
      const itemAtual = sacola.find((i) => i.produtoId === produtoId)
      const novaQtdSacola = (itemAtual?.quantidade ?? 1) - 1
      return { ...c, quantidade: Math.min(c.quantidade, novaQtdSacola) }
    }).filter((c) => c.quantidade > 0))
  }

  const handleRemover = (produtoId: string) => {
    setSacola((prev) => prev.filter((i) => i.produtoId !== produtoId))
    setCascos((prev) => prev.filter((c) => c.produto_id !== produtoId))
  }

  const handleToggleCasco = (produtoId: string, comCasco: boolean) => {
    setSacola((prev) =>
      prev.map((i) => {
        if (i.produtoId !== produtoId) return i
        return { ...i, comCasco, quantidade: comCasco ? 1 : i.quantidade }
      }),
    )
    if (comCasco) {
      setCascos((prev) => prev.filter((c) => c.produto_id !== produtoId))
    }
  }

  const resetForm = () => {
    setSacola([])
    setCascos([])
    setCliente(null)
    setEndereco(null)
    setFormaPagamento(null)
    setValeNumero("")
    setDataPagamentoVale("")
    setValeGasNumero("")
    setValeGasBlocoId(null)
    setGasPovoValorGov("")
    setGasPovoFrete("")
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
            | "cartao_debito" | "cartao_credito" | "pix" | "dinheiro" | "vale" | "vale_gas" | "gas_povo",
          vale_numero: formaPagamento === "vale" && valeNumero ? Number(valeNumero) : undefined,
          data_pagamento_vale: formaPagamento === "vale" && dataPagamentoVale ? dataPagamentoVale : undefined,
          vale_gas_numero: formaPagamento === "vale_gas" && valeGasNumero ? Number(valeGasNumero) : undefined,
          vale_gas_bloco_id: formaPagamento === "vale_gas" ? (valeGasBlocoId ?? undefined) : undefined,
          gas_povo_frete: formaPagamento === "gas_povo" && gasPovoFrete ? gasPovoFrete : undefined,
          valor_pago: formaPagamento === "gas_povo" ? (gasPovoValorGov || "0") : valorPago,
          data_venda: dataVenda,
          itens: sacola.map((i) => ({
            produto_id: i.produtoId,
            quantidade: i.quantidade,
            com_casco: i.comCasco ?? false,
          })),
          cascos: cascos.length > 0 ? cascos : [],
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
      queryClient.invalidateQueries({ queryKey: ["cascos"] })
    },
  })

  const gasPovoValido =
    formaPagamento === "gas_povo" &&
    parseFloat(gasPovoValorGov) > 0 &&
    parseFloat(gasPovoFrete) > 0

  const podeFinalizar =
    !!cliente &&
    sacola.length > 0 &&
    !!motoristaId &&
    !!formaPagamento &&
    (formaPagamento !== "vale" || valeNumero.trim().length > 0) &&
    (formaPagamento !== "vale_gas" || (valeGasNumero.trim().length > 0 && !!valeGasBlocoId)) &&
    (formaPagamento !== "gas_povo" || gasPovoValido)

  const handleAbrirResumo = () => {
    if (!cliente) return showErrorToast("Selecione ou cadastre um cliente")
    if (sacola.length === 0) return showErrorToast("Adicione ao menos 1 produto na sacola")
    if (!formaPagamento) return showErrorToast("Selecione a forma de pagamento")
    if (formaPagamento === "vale" && !valeNumero.trim()) return showErrorToast("Informe o número do fiado")
    if (formaPagamento === "vale_gas" && !valeGasNumero.trim()) return showErrorToast("Informe o número do vale gás")
    if (formaPagamento === "vale_gas" && !valeGasBlocoId) return showErrorToast("Número de vale gás inválido — verifique o estabelecimento")
    if (formaPagamento === "gas_povo" && !(parseFloat(gasPovoValorGov) > 0)) return showErrorToast("Informe o valor do governo para Gás do Povo")
    if (formaPagamento === "gas_povo" && !(parseFloat(gasPovoFrete) > 0)) return showErrorToast("Informe o valor do frete para Gás do Povo")
    setShowResumo(true)
  }

  const motoristaNome =
    usuariosCombo.find((u) => u.id === motoristaId)?.full_name ||
    usuariosCombo.find((u) => u.id === motoristaId)?.email || ""

  // Valor total formatado para exibição
  const totalFormatado = formaPagamento === "gas_povo"
    ? formatMoney((parseFloat(gasPovoValorGov) || 0) + (parseFloat(gasPovoFrete) || 0))
    : formatMoney(total)

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vendas</h1>
        <p className="text-muted-foreground">Venda de balcão da distribuidora</p>
      </div>

      {/* Atribuir venda — linha única acima do grid */}
      <div className="grid gap-1.5 max-w-sm">
        <Label>Atribuir venda a</Label>
        <Select value={motoristaId} onValueChange={setMotoristaId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            {usuariosCombo.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.full_name || u.email}
                {u.roles && u.roles.length > 0 ? ` (${u.roles.join(", ")})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Grid principal 2 colunas: esquerda = conteúdo / direita = sacola+ações */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">

        {/* ── Coluna ESQUERDA ── */}
        <div className="flex flex-col gap-6">

          {/* Linha 1E: Cliente */}
          <div>
            <p className="mb-2 text-sm font-medium">Cliente</p>
            <ClienteSection
              cliente={cliente}
              onClienteChange={setCliente}
              enderecoSelecionado={endereco}
              onEnderecoChange={setEndereco}
            />
          </div>

          {/* Linha 2E: Produtos */}
          <div>
            <p className="mb-2 text-sm font-medium">Produtos</p>
            <ProdutoGrid
              produtos={produtos}
              quantidadesNaSacola={quantidadesNaSacola}
              onSelect={handleSelectProduto}
            />
          </div>

          {/* Linha 3E: Forma de Pagamento */}
          <div>
            <FormaPagamento
              value={formaPagamento}
              onChange={(v) => { setFormaPagamento(v); setValorPagoManual(false) }}
              valeNumero={valeNumero}
              onValeNumeroChange={setValeNumero}
              dataPagamentoVale={dataPagamentoVale}
              onDataPagamentoValeChange={setDataPagamentoVale}
              valeGasNumero={valeGasNumero}
              onValeGasNumeroChange={setValeGasNumero}
              onValeGasBlocoIdChange={setValeGasBlocoId}
              gasPovoValorGov={gasPovoValorGov}
              onGasPovoValorGovChange={setGasPovoValorGov}
              gasPovoFrete={gasPovoFrete}
              onGasPovoFreteChange={setGasPovoFrete}
            />
          </div>

          {/* Linha 4E: vazio intencional */}
        </div>

        {/* ── Coluna DIREITA ── */}
        <div className="flex flex-col gap-4">

          {/* Linha 1D: Sacola */}
          <div>
            <p className="mb-2 text-sm font-medium">Sacola</p>
            <Sacola
              itens={sacola}
              onIncrementar={handleIncrementar}
              onDecrementar={handleDecrementar}
              onRemover={handleRemover}
              onToggleCasco={handleToggleCasco}
            />
          </div>

          {/* Linha 2D: Empréstimo de casco */}
          <PainelCasco
            itens={sacola}
            cascos={cascos}
            onChange={setCascos}
          />

          {/* Linha 3D: Valor pago + Data */}
          {formaPagamento !== "gas_povo" && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
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
          )}

          {formaPagamento === "gas_povo" && (
            <div className="rounded-lg border p-3">
              <div className="grid gap-1.5">
                <Label htmlFor="data-venda-gp">Data</Label>
                <Input
                  id="data-venda-gp"
                  type="date"
                  value={dataVenda}
                  onChange={(e) => setDataVenda(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Linha 4D: Total + Finalizar */}
          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Total</span>
              <span className="text-xl font-bold">{totalFormatado}</span>
            </div>
            <Button
              size="lg"
              className="w-full"
              disabled={!podeFinalizar}
              onClick={handleAbrirResumo}
            >
              Finalizar Venda
            </Button>
          </div>

        </div>
      </div>

      <ResumoVendaDialog
        open={showResumo}
        onOpenChange={setShowResumo}
        clienteNome={cliente?.nome ?? ""}
        endereco={endereco}
        motoristaNome={motoristaNome}
        itens={sacola}
        cascos={cascos}
        formaPagamento={formaPagamento ?? ""}
        valeNumero={valeNumero}
        dataPagamentoVale={dataPagamentoVale}
        valorPago={formaPagamento === "gas_povo"
          ? String((parseFloat(gasPovoValorGov) || 0) + (parseFloat(gasPovoFrete) || 0))
          : valorPago}
        dataVenda={dataVenda}
        isPending={mutation.isPending}
        onConfirm={() => mutation.mutate()}
      />
    </div>
  )
}
