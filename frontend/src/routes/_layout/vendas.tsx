// [mcp-local harness] feature: fix_borda_amber_pagamento | plano: 2508b369 | 2026-09-10 20:09:52
// Borda âmbar no painel de formas de pagamento quando há formas selecionadas
// mutationFn envia pagamentos[] no mix; forma única usa caminho legado
// fix: campo valor fiado puro editável — valor digitado é respeitado
// fix: valor_pago = somaFormas para fiado (pode ser menor que total = desconto intencional)
// ux: borda âmbar no painel de formas de pagamento quando há formas selecionadas
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"

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
import { FormaPagamento, type FormaPagamentoValue, FORMAS_EXCLUSIVAS } from "@/components/Vendas/FormaPagamento"
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
const COR_VERDE = "text-[#00a63e]"

const FORMAS_EXCLUSIVAS_SET = new Set<FormaPagamentoValue>(["vale_gas", "gas_povo"])

const LABEL_FORMA: Record<FormaPagamentoValue, string> = {
  cartao_debito:  "Débito",
  cartao_credito: "Crédito",
  pix:            "Pix",
  dinheiro:       "Dinheiro",
  vale:           "Fiado",
  vale_gas:       "Vale Gás",
  gas_povo:       "Gás do Povo",
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function quintoUtilMesSeguinte(): string {
  const hoje = new Date()
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1)
  let uteis = 0
  const d = new Date(primeiroDia)
  while (uteis < 5) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== 0 && d.getDay() !== 6) uteis++
  }
  return d.toISOString().slice(0, 10)
}

function trinta(): string {
  const d = new Date()
  d.setDate(d.getDate() + 30)
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

type VctoTipo = "quinto" | "trinta" | "manual"

export const Route = createFileRoute("/_layout/vendas")({
  component: Vendas,
  beforeLoad: async () => {
    const perms = await UsersService.readUserPermissions()
    const canRead =
      perms.is_superuser ||
      perms.permissions.some((p) => p.module === MODULE && p.can_read)
    if (!canRead) throw redirect({ to: "/" })
  },
  head: () => ({ meta: [{ title: "Vendas - FastAPI Template" }] }),
})

function Vendas() {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const [sacola, setSacola] = useState<SacolaItem[]>([])
  const [cascos, setCascos] = useState<CascoItem[]>([])
  const [cliente, setCliente] = useState<ClientePublic | null>(null)
  const [endereco, setEndereco] = useState<EnderecoPublic | null>(null)
  const [motoristaId, setMotoristaId] = useState("")
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamentoValue[]>([])
  const [valoresPorForma, setValoresPorForma] = useState<Partial<Record<FormaPagamentoValue, string>>>({})
  const [valeNumero, setValeNumero] = useState("")
  const [vctoTipo, setVctoTipo] = useState<VctoTipo>("quinto")
  const [dataPagamentoVale, setDataPagamentoVale] = useState(quintoUtilMesSeguinte())
  const [valeGasNumero, setValeGasNumero] = useState("")
  const [valeGasBlocoId, setValeGasBlocoId] = useState<string | null>(null)
  const [valeGasInfo, setValeGasInfo] = useState<ValeGasInfo | null>(null)
  const [validandoValeGas, setValidandoValeGas] = useState(false)
  const [gasPovoValorGov, setGasPovoValorGov] = useState("")
  const [gasPovoFrete, setGasPovoFrete] = useState("")
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

  const usuariosCombo = (users?.data ?? []).filter(
    (u) =>
      u.full_name === NOME_DISTRIBUIDORA ||
      (u.roles ?? []).some((r) => ROLES_PERMITIDAS.includes(r.toLowerCase())),
  )

  useEffect(() => {
    if (motoristaId || !users) return
    const dist = users.data.find((u) => u.full_name === NOME_DISTRIBUIDORA)
    if (dist) setMotoristaId(dist.id)
  }, [users, motoristaId])

  useEffect(() => {
    if (!formasPagamento.includes("vale") || !motoristaId) return
    VendasService.readProximoNumeroVale({ motoristaId })
      .then((res) => {
        if (res.numero == null) return
        setValeNumero((atual) => (atual ? atual : String(res.numero)))
      })
      .catch(() => {})
  }, [formasPagamento, motoristaId])

  useEffect(() => {
    if (!formasPagamento.includes("vale_gas") || !valeGasNumero.trim()) {
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
  }, [valeGasNumero, formasPagamento])

  useEffect(() => {
    if (!formasPagamento.includes("gas_povo")) { setGasPovoValorGov(""); setGasPovoFrete("") }
    if (!formasPagamento.includes("vale_gas")) { setValeGasNumero(""); setValeGasInfo(null); setValeGasBlocoId(null) }
    if (!formasPagamento.includes("vale")) { setValeNumero("") }
  }, [formasPagamento])

  useEffect(() => {
    const ids = new Set(sacola.map((i) => i.produtoId))
    setCascos((prev) => prev.filter((c) => ids.has(c.produto_id)))
  }, [sacola])

  // ── Totais ────────────────────────────────────────────────────────────────
  const totalSacola = sacola.reduce((acc, item) => {
    const gas = Number(item.precoUnitario) * item.quantidade
    const casco = item.comCasco && item.precoCascoAtual
      ? Number(item.precoCascoAtual) * item.quantidade : 0
    return acc + gas + casco
  }, 0)

  const prevTotalSacola = useRef<number | null>(null)
  useEffect(() => {
    if (formasPagamento.length === 0) return
    if (prevTotalSacola.current === null) {
      prevTotalSacola.current = totalSacola
      return
    }
    if (prevTotalSacola.current === totalSacola) return
    prevTotalSacola.current = totalSacola
    setValoresPorForma(() => {
      const novo: Partial<Record<FormaPagamentoValue, string>> = {}
      formasPagamento.forEach((f) => {
        novo[f] = formasPagamento.length === 1 ? totalSacola.toFixed(2) : ""
      })
      return novo
    })
  }, [totalSacola, formasPagamento])

  const somaFormas = formasPagamento.reduce(
    (acc, f) => acc + (parseFloat(valoresPorForma[f] ?? "0") || 0), 0,
  )

  const gasPovoTotal = (parseFloat(gasPovoValorGov) || 0) + (parseFloat(gasPovoFrete) || 0)
  const totalPago = formasPagamento.includes("gas_povo") ? gasPovoTotal : somaFormas

  const pagamentoOk = formasPagamento.length > 0 && totalPago >= totalSacola
  const corPago = pagamentoOk ? COR_VERDE : "text-amber-500"

  // ── Handlers valor por forma ──────────────────────────────────────────────
  const handleValorForma = (forma: FormaPagamentoValue, raw: string) => {
    const valor = parseFloat(raw) || 0
    setValoresPorForma((prev) => {
      const novo = { ...prev, [forma]: raw }
      if (formasPagamento.length === 2) {
        const outra = formasPagamento.find((f) => f !== forma)
        if (outra && !prev[outra]) {
          const saldo = Math.max(0, totalSacola - valor)
          novo[outra] = saldo > 0 ? saldo.toFixed(2) : ""
        }
      }
      return novo
    })
  }

  const handleFormasChange = (novas: FormaPagamentoValue[]) => {
    setFormasPagamento(novas)
    setValoresPorForma((prev) => {
      const novo: Partial<Record<FormaPagamentoValue, string>> = {}
      novas.forEach((f) => {
        if (prev[f] !== undefined) {
          novo[f] = prev[f]
        } else {
          novo[f] = novas.length === 1 ? totalSacola.toFixed(2) : ""
        }
      })
      return novo
    })
  }

  // ── Sacola ────────────────────────────────────────────────────────────────
  const quantidadesNaSacola = Object.fromEntries(sacola.map((i) => [i.produtoId, i.quantidade]))

  const handleSelectProduto = (produto: ProdutoComPrecoPublic) => {
    if (!produto.preco_atual) return
    setSacola((prev) => {
      const existente = prev.find((i) => i.produtoId === produto.id)
      if (existente) return prev.map((i) => i.produtoId === produto.id ? { ...i, quantidade: i.quantidade + 1 } : i)
      return [...prev, {
        produtoId: produto.id,
        title: produto.title,
        precoUnitario: produto.preco_atual as string,
        quantidade: 1,
        vendeCasco: produto.vende_casco ?? false,
        precoCascoAtual: produto.preco_casco_atual ?? null,
        comCasco: false,
      }]
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
      return { ...c, quantidade: Math.min(c.quantidade, (itemAtual?.quantidade ?? 1) - 1) }
    }).filter((c) => c.quantidade > 0))
  }

  const handleRemover = (produtoId: string) => {
    setSacola((prev) => prev.filter((i) => i.produtoId !== produtoId))
    setCascos((prev) => prev.filter((c) => c.produto_id !== produtoId))
  }

  const handleToggleCasco = (produtoId: string, comCasco: boolean) => {
    setSacola((prev) => prev.map((i) => {
      if (i.produtoId !== produtoId) return i
      return { ...i, comCasco, quantidade: comCasco ? 1 : i.quantidade }
    }))
    if (comCasco) setCascos((prev) => prev.filter((c) => c.produto_id !== produtoId))
  }

  const handleVctoTipo = (tipo: VctoTipo) => {
    setVctoTipo(tipo)
    if (tipo === "quinto") setDataPagamentoVale(quintoUtilMesSeguinte())
    else if (tipo === "trinta") setDataPagamentoVale(trinta())
  }

  const resetForm = () => {
    setSacola([]); setCascos([]); setCliente(null); setEndereco(null)
    setFormasPagamento([]); setValoresPorForma({})
    setValeNumero(""); setVctoTipo("quinto"); setDataPagamentoVale(quintoUtilMesSeguinte())
    setValeGasNumero(""); setValeGasBlocoId(null); setValeGasInfo(null)
    setGasPovoValorGov(""); setGasPovoFrete("")
    setDataVenda(hojeISO()); setShowResumo(false)
    prevTotalSacola.current = null
  }

  // ── Validações ────────────────────────────────────────────────────────────
  const gasPovoValido = formasPagamento.includes("gas_povo") &&
    parseFloat(gasPovoValorGov) > 0 && parseFloat(gasPovoFrete) > 0

  const formaPrincipal = formasPagamento[0] ?? null
  const formasMix = formasPagamento.filter((f) => !FORMAS_EXCLUSIVAS_SET.has(f))
  const usaMix = formasMix.length > 1

  const valorPagoEnvio = formasPagamento.includes("gas_povo")
    ? String(gasPovoTotal)
    : somaFormas.toFixed(2)

  const podeFinalizar =
    !!cliente && sacola.length > 0 && !!motoristaId && formasPagamento.length > 0 &&
    (!formasPagamento.includes("vale") || valeNumero.trim().length > 0) &&
    (!formasPagamento.includes("vale_gas") || (valeGasNumero.trim().length > 0 && !!valeGasBlocoId)) &&
    (!formasPagamento.includes("gas_povo") || gasPovoValido)

  const handleAbrirResumo = () => {
    if (!cliente) return showErrorToast("Selecione ou cadastre um cliente")
    if (sacola.length === 0) return showErrorToast("Adicione ao menos 1 produto na sacola")
    if (formasPagamento.length === 0) return showErrorToast("Selecione a forma de pagamento")
    if (formasPagamento.includes("vale") && !valeNumero.trim()) return showErrorToast("Informe o número do fiado")
    if (formasPagamento.includes("vale_gas") && !valeGasNumero.trim()) return showErrorToast("Informe o número do vale gás")
    if (formasPagamento.includes("vale_gas") && !valeGasBlocoId) return showErrorToast("Número de vale gás inválido — verifique o estabelecimento")
    if (formasPagamento.includes("gas_povo") && !(parseFloat(gasPovoValorGov) > 0)) return showErrorToast("Informe o valor do governo para Gás do Povo")
    if (formasPagamento.includes("gas_povo") && !(parseFloat(gasPovoFrete) > 0)) return showErrorToast("Informe o valor do frete para Gás do Povo")
    setShowResumo(true)
  }

  // ── Mutation ──────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: () => {
      const pagamentos = usaMix
        ? formasMix.map((forma) => {
            const valor = parseFloat(valoresPorForma[forma] ?? "0") || 0
            const base: Record<string, unknown> = { forma_pagamento: forma, valor }
            if (forma === "vale") {
              base.vale_numero = valeNumero ? Number(valeNumero) : undefined
              base.data_pagamento_vale = dataPagamentoVale || undefined
            }
            return base
          })
        : []

      return VendasService.createVenda({
        requestBody: {
          cliente_id: cliente?.id ?? "",
          endereco_id: endereco?.id,
          motorista_id: motoristaId,
          forma_pagamento: formaPrincipal as
            | "cartao_debito" | "cartao_credito" | "pix" | "dinheiro"
            | "vale" | "vale_gas" | "gas_povo",
          pagamentos: pagamentos as any,
          vale_numero: !usaMix && formasPagamento.includes("vale") && valeNumero
            ? Number(valeNumero) : undefined,
          data_pagamento_vale: !usaMix && formasPagamento.includes("vale") && dataPagamentoVale
            ? dataPagamentoVale : undefined,
          vale_gas_numero: formasPagamento.includes("vale_gas") && valeGasNumero
            ? Number(valeGasNumero) : undefined,
          vale_gas_bloco_id: formasPagamento.includes("vale_gas")
            ? (valeGasBlocoId ?? undefined) : undefined,
          gas_povo_frete: formasPagamento.includes("gas_povo") && gasPovoFrete
            ? gasPovoFrete : undefined,
          valor_pago: valorPagoEnvio,
          data_venda: dataVenda,
          itens: sacola.map((i) => ({
            produto_id: i.produtoId,
            quantidade: i.quantidade,
            com_casco: i.comCasco ?? false,
          })),
          cascos: cascos.length > 0 ? cascos : [],
        },
      })
    },
    onSuccess: () => { showSuccessToast("Venda registrada com sucesso"); resetForm() },
    onError: (err: ApiError) => { handleError.call(showErrorToast, err); setShowResumo(false) },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["vales"] })
      queryClient.invalidateQueries({ queryKey: ["blocosVale"] })
      queryClient.invalidateQueries({ queryKey: ["cascos"] })
    },
  })

  const motoristaNome =
    usuariosCombo.find((u) => u.id === motoristaId)?.full_name ||
    usuariosCombo.find((u) => u.id === motoristaId)?.email || ""

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 pb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vendas</h1>
        <p className="text-muted-foreground">Venda de balcão da distribuidora</p>
      </div>

      <div className="grid gap-1.5 max-w-sm">
        <Label>Atribuir venda a</Label>
        <Select value={motoristaId} onValueChange={setMotoristaId}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Selecione" /></SelectTrigger>
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">

        {/* ── Coluna ESQUERDA ── */}
        <div className="flex flex-col gap-6">
          <div>
            <p className="mb-2 text-sm font-medium">Cliente</p>
            <ClienteSection cliente={cliente} onClienteChange={setCliente} enderecoSelecionado={endereco} onEnderecoChange={setEndereco} />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Produtos</p>
            <ProdutoGrid produtos={produtos} quantidadesNaSacola={quantidadesNaSacola} onSelect={handleSelectProduto} />
          </div>
          <FormaPagamento value={formasPagamento} onChange={handleFormasChange} />
        </div>

        {/* ── Coluna DIREITA ── */}
        <div className="flex flex-col gap-4">

          <div>
            <p className="mb-2 text-sm font-medium">Sacola</p>
            <Sacola itens={sacola} onIncrementar={handleIncrementar} onDecrementar={handleDecrementar} onRemover={handleRemover} onToggleCasco={handleToggleCasco} />
          </div>

          <PainelCasco itens={sacola} cascos={cascos} onChange={setCascos} />

          {/* Painel de formas de pagamento — borda âmbar quando há formas selecionadas */}
          {formasPagamento.length > 0 && (
            <div className={`flex flex-col gap-2 rounded-lg border p-3 transition-colors ${
              formasPagamento.length > 0 ? "border-amber-400" : ""
            }`}>

              {formasPagamento.includes("gas_povo") && (
                <>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Gás do Povo</p>
                  <div className="rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 px-3 py-2">
                    <p className="text-xs text-blue-800 dark:text-blue-200">O governo paga depois. O frete é cobrado do cliente no ato.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="gas-povo-valor-gov">Valor governo (R$)</Label>
                      <Input id="gas-povo-valor-gov" type="number" inputMode="decimal" step="0.01" min="0" value={gasPovoValorGov} onChange={(e) => setGasPovoValorGov(e.target.value)} placeholder="0,00" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="gas-povo-frete">Frete cliente (R$)</Label>
                      <Input id="gas-povo-frete" type="number" inputMode="decimal" step="0.01" min="0" value={gasPovoFrete} onChange={(e) => setGasPovoFrete(e.target.value)} placeholder="0,00" />
                    </div>
                  </div>
                </>
              )}

              {formasPagamento.includes("vale_gas") && (
                <>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Vale Gás</p>
                  <div className="grid gap-1.5">
                    <Label htmlFor="vale-gas-numero">Número do vale gás</Label>
                    <Input id="vale-gas-numero" type="number" inputMode="numeric" value={valeGasNumero} onChange={(e) => setValeGasNumero(e.target.value)} placeholder="Ex: 1001" />
                  </div>
                  {validandoValeGas && <p className="text-xs text-muted-foreground">Verificando...</p>}
                  {!validandoValeGas && valeGasInfo !== null && (
                    valeGasInfo.valido ? (
                      <div className="rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 px-3 py-2">
                        <p className="text-xs font-medium text-green-800 dark:text-green-200">✓ {valeGasInfo.estabelecimento_nome}</p>
                        <p className="text-xs text-green-700 dark:text-green-300">{valeGasInfo.estabelecimento_cpf}</p>
                      </div>
                    ) : (
                      <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2">
                        <p className="text-xs text-destructive">Número não encontrado em nenhum bloco de vale gás.</p>
                      </div>
                    )
                  )}
                </>
              )}

              {formasPagamento.filter((f) => !FORMAS_EXCLUSIVAS.includes(f)).map((forma) => (
                <div key={forma} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Label className="w-20 shrink-0 text-sm">{LABEL_FORMA[forma]}</Label>
                    <Input
                      type="number" inputMode="decimal" step="0.01" min="0"
                      value={valoresPorForma[forma] ?? ""}
                      onChange={(e) => handleValorForma(forma, e.target.value)}
                      placeholder="R$ 0,00" className="flex-1"
                    />
                  </div>
                  {forma === "vale" && (
                    <div className="ml-[5.5rem] flex flex-col gap-2 border-l-2 border-border pl-3">
                      <div className="grid gap-1.5">
                        <Label htmlFor="vale-numero" className="text-xs text-muted-foreground">Número da folha (bloco)</Label>
                        <Input id="vale-numero" type="number" inputMode="numeric" value={valeNumero} onChange={(e) => setValeNumero(e.target.value)} placeholder="Ex: 47" className="h-8 text-sm" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="text-xs text-muted-foreground">Vencimento</p>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="vcto-tipo" checked={vctoTipo === "quinto"} onChange={() => handleVctoTipo("quinto")} className="accent-primary" />
                          <span className="text-xs text-muted-foreground">5º dia útil do mês seguinte</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="vcto-tipo" checked={vctoTipo === "trinta"} onChange={() => handleVctoTipo("trinta")} className="accent-primary" />
                          <span className="text-xs text-muted-foreground">30 dias a partir de hoje</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="vcto-tipo" checked={vctoTipo === "manual"} onChange={() => handleVctoTipo("manual")} className="accent-primary" />
                          <span className="text-xs text-muted-foreground">Data manual</span>
                        </label>
                      </div>
                      <Input type="date" value={dataPagamentoVale} onChange={(e) => { setDataPagamentoVale(e.target.value); setVctoTipo("manual") }} className="h-8 text-sm" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="rounded-lg border p-3">
            <div className="grid gap-1.5">
              <Label htmlFor="data-venda">Data da venda</Label>
              <Input id="data-venda" type="date" value={dataVenda} onChange={(e) => setDataVenda(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className={`text-sm font-medium ${COR_VERDE}`}>Sacola</span>
              <span className={`text-sm font-medium ${COR_VERDE}`}>{formatMoney(totalSacola)}</span>
            </div>
            {formasPagamento.length > 0 && (
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${corPago}`}>Pago</span>
                <span className={`text-sm font-semibold ${corPago}`}>{formatMoney(totalPago)}</span>
              </div>
            )}
            <div className="my-1 border-t" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total</span>
              <span className={`text-xl font-bold ${formasPagamento.length > 0 ? corPago : ""}`}>
                {formatMoney(formasPagamento.length > 0 ? totalPago : totalSacola)}
              </span>
            </div>
            <Button size="lg" className="w-full mt-1" disabled={!podeFinalizar} onClick={handleAbrirResumo}>
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
        formaPagamento={formaPrincipal ?? ""}
        formasPagamento={formasPagamento}
        valeNumero={valeNumero}
        dataPagamentoVale={dataPagamentoVale}
        valorPago={valorPagoEnvio}
        dataVenda={dataVenda}
        isPending={mutation.isPending}
        onConfirm={() => mutation.mutate()}
      />
    </div>
  )
}
