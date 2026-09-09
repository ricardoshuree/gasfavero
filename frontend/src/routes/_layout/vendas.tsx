// [mcp-local harness] feature: vendas_ajustes_cosmeticos | plano: 14031785 | 2026-09-09 14:21:01
// Campos extras de forma de pagamento na coluna direita; FormaPagamento recebe só value+onChange
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
import { Checkbox } from "@/components/ui/checkbox"
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
import { FormaPagamento, type FormaPagamentoValue } from "@/components/Vendas/FormaPagamento"
import PainelCasco, { type CascoItem } from "@/components/Vendas/PainelCasco"
import ProdutoGrid from "@/components/Vendas/ProdutoGrid"
import ResumoVendaDialog from "@/components/Vendas/ResumoVendaDialog"
import Sacola, { type SacolaItem } from "@/components/Vendas/Sacola"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

const MODULE = "vendas"
const NOME_DISTRIBUIDORA = "Distribuidora Gás Favero"
const ROLES_PERMITIDAS = ["gerente", "motorista"]
const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"

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

interface ValeGasInfo {
  valido: boolean
  estabelecimento_nome: string | null
  estabelecimento_cpf: string | null
  bloco_id: string | null
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
  // Fiado
  const [valeNumero, setValeNumero] = useState("")
  const [dataPagamentoVale, setDataPagamentoVale] = useState("")
  const [quintoUtil, setQuintoUtil] = useState(true)
  // Vale Gás
  const [valeGasNumero, setValeGasNumero] = useState("")
  const [valeGasBlocoId, setValeGasBlocoId] = useState<string | null>(null)
  const [valeGasInfo, setValeGasInfo] = useState<ValeGasInfo | null>(null)
  const [validandoValeGas, setValidandoValeGas] = useState(false)
  // Gás do Povo
  const [gasPovoValorGov, setGasPovoValorGov] = useState("")
  const [gasPovoFrete, setGasPovoFrete] = useState("")
  // Valores
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

  // Próximo número de vale (Fiado)
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

  // Validação em tempo real do Vale Gás
  useEffect(() => {
    if (formaPagamento !== "vale_gas" || !valeGasNumero.trim()) {
      setValeGasInfo(null)
      setValeGasBlocoId(null)
      return
    }
    const timer = setTimeout(async () => {
      setValidandoValeGas(true)
      try {
        const token = localStorage.getItem("access_token")
        const res = await fetch(
          `${API}/api/v1/vale-gas/validar-numero/${valeGasNumero}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (!res.ok) throw new Error()
        const data: ValeGasInfo = await res.json()
        setValeGasInfo(data)
        setValeGasBlocoId(data.valido ? data.bloco_id : null)
      } catch {
        setValeGasInfo(null)
        setValeGasBlocoId(null)
      } finally {
        setValidandoValeGas(false)
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [valeGasNumero, formaPagamento])

  // Limpa campos ao trocar forma de pagamento
  useEffect(() => {
    if (formaPagamento !== "gas_povo") {
      setGasPovoValorGov("")
      setGasPovoFrete("")
    }
    if (formaPagamento !== "vale_gas") {
      setValeGasNumero("")
      setValeGasInfo(null)
      setValeGasBlocoId(null)
    }
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
    setQuintoUtil(true)
    setValeGasNumero("")
    setValeGasBlocoId(null)
    setValeGasInfo(null)
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

  const gasPovoTotal = (parseFloat(gasPovoValorGov) || 0) + (parseFloat(gasPovoFrete) || 0)

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

  const totalFormatado = formaPagamento === "gas_povo"
    ? formatMoney(gasPovoTotal)
    : formatMoney(total)

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vendas</h1>
        <p className="text-muted-foreground">Venda de balcão da distribuidora</p>
      </div>

      {/* Atribuir venda */}
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

      {/* Grid principal: esquerda = conteúdo / direita = sacola + ações */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">

        {/* ── Coluna ESQUERDA ── */}
        <div className="flex flex-col gap-6">

          {/* Cliente */}
          <div>
            <p className="mb-2 text-sm font-medium">Cliente</p>
            <ClienteSection
              cliente={cliente}
              onClienteChange={setCliente}
              enderecoSelecionado={endereco}
              onEnderecoChange={setEndereco}
            />
          </div>

          {/* Produtos */}
          <div>
            <p className="mb-2 text-sm font-medium">Produtos</p>
            <ProdutoGrid
              produtos={produtos}
              quantidadesNaSacola={quantidadesNaSacola}
              onSelect={handleSelectProduto}
            />
          </div>

          {/* Forma de Pagamento (só grade de botões) */}
          <FormaPagamento
            value={formaPagamento}
            onChange={(v) => { setFormaPagamento(v); setValorPagoManual(false) }}
          />

        </div>

        {/* ── Coluna DIREITA ── */}
        <div className="flex flex-col gap-4">

          {/* Sacola */}
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

          {/* Empréstimo de casco */}
          <PainelCasco
            itens={sacola}
            cascos={cascos}
            onChange={setCascos}
          />

          {/* Campos extras de forma de pagamento — coluna direita */}
          {formaPagamento === "vale" && (
            <div className="flex flex-col gap-3 rounded-lg border p-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fiado</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="vale-numero">Número do fiado</Label>
                  <Input
                    id="vale-numero"
                    type="number"
                    inputMode="numeric"
                    value={valeNumero}
                    onChange={(e) => setValeNumero(e.target.value)}
                    placeholder="Ex: 123"
                  />
                </div>
                {!quintoUtil && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="data-pagamento-vale">Data a ser pago</Label>
                    <Input
                      id="data-pagamento-vale"
                      type="date"
                      value={dataPagamentoVale}
                      onChange={(e) => setDataPagamentoVale(e.target.value)}
                    />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="quinto-util"
                  checked={quintoUtil}
                  onCheckedChange={(checked) => {
                    setQuintoUtil(checked === true)
                    if (checked) setDataPagamentoVale("")
                  }}
                />
                <label htmlFor="quinto-util" className="text-sm text-muted-foreground cursor-pointer select-none">
                  5º dia útil do mês seguinte
                </label>
              </div>
            </div>
          )}

          {formaPagamento === "vale_gas" && (
            <div className="flex flex-col gap-3 rounded-lg border p-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Vale Gás</p>
              <div className="grid gap-1.5">
                <Label htmlFor="vale-gas-numero">Número do vale gás</Label>
                <Input
                  id="vale-gas-numero"
                  type="number"
                  inputMode="numeric"
                  value={valeGasNumero}
                  onChange={(e) => setValeGasNumero(e.target.value)}
                  placeholder="Ex: 1001"
                />
              </div>
              {validandoValeGas && <p className="text-xs text-muted-foreground">Verificando...</p>}
              {!validandoValeGas && valeGasInfo !== null && (
                valeGasInfo.valido ? (
                  <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2">
                    <p className="text-xs font-medium text-green-800">✓ {valeGasInfo.estabelecimento_nome}</p>
                    <p className="text-xs text-green-700">{valeGasInfo.estabelecimento_cpf}</p>
                  </div>
                ) : (
                  <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2">
                    <p className="text-xs text-destructive">Número não encontrado em nenhum bloco de vale gás.</p>
                  </div>
                )
              )}
            </div>
          )}

          {formaPagamento === "gas_povo" && (
            <div className="flex flex-col gap-3 rounded-lg border p-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Gás do Povo</p>
              <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2">
                <p className="text-xs text-blue-800">O governo paga depois. O frete é cobrado do cliente no ato.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="gas-povo-valor-gov">Valor do governo (R$)</Label>
                  <Input id="gas-povo-valor-gov" type="number" inputMode="decimal" step="0.01" min="0" value={gasPovoValorGov} onChange={(e) => setGasPovoValorGov(e.target.value)} placeholder="0,00" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="gas-povo-frete">Frete do cliente (R$)</Label>
                  <Input id="gas-povo-frete" type="number" inputMode="decimal" step="0.01" min="0" value={gasPovoFrete} onChange={(e) => setGasPovoFrete(e.target.value)} placeholder="0,00" />
                </div>
              </div>
              {gasPovoTotal > 0 && (
                <div className="flex justify-between items-center rounded-md bg-muted px-3 py-2">
                  <span className="text-xs text-muted-foreground">Total a receber</span>
                  <span className="text-sm font-semibold">R$ {gasPovoTotal.toFixed(2).replace(".", ",")}</span>
                </div>
              )}
            </div>
          )}

          {/* Valor pago + Data */}
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
                <Input id="data-venda-gp" type="date" value={dataVenda} onChange={(e) => setDataVenda(e.target.value)} />
              </div>
            </div>
          )}

          {/* Total + Finalizar */}
          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Total</span>
              <span className="text-xl font-bold">{totalFormatado}</span>
            </div>
            <Button size="lg" className="w-full" disabled={!podeFinalizar} onClick={handleAbrirResumo}>
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
          ? String(gasPovoTotal)
          : valorPago}
        dataVenda={dataVenda}
        isPending={mutation.isPending}
        onConfirm={() => mutation.mutate()}
      />
    </div>
  )
}
