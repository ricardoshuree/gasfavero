// [mcp-local harness] feature: multiplas_formas_pagamento_ui | plano: 47ac2e3b | 2026-09-09 15:53:33
// Estado multi-forma; coluna direita com linha por forma + valor editável + auto-fill; Fiado inline com folha e checkboxes vencimento; total verde/âmbar
// Tema 2: múltiplas formas de pagamento.
// formasPagamento: FormaPagamentoValue[] — cada forma tem um valor associado em valoresPorForma.
// Vale Gás e Gás do Povo continuam exclusivos (tratados em FormaPagamento.tsx).
// Fiado expande folha + vencimento (checkbox 5º dia útil OU 30 dias, mutuamente exclusivos).
// Total verde quando soma >= sacola, âmbar quando soma < sacola.
// Backend ainda recebe forma_pagamento como string (campo principal) — migration Tema 2 vem depois.
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

// Tipo de vencimento para o Fiado
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

  // Sacola e cascos
  const [sacola, setSacola] = useState<SacolaItem[]>([])
  const [cascos, setCascos] = useState<CascoItem[]>([])

  // Cliente / endereço / motorista
  const [cliente, setCliente] = useState<ClientePublic | null>(null)
  const [endereco, setEndereco] = useState<EnderecoPublic | null>(null)
  const [motoristaId, setMotoristaId] = useState("")

  // Múltiplas formas de pagamento
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamentoValue[]>([])
  // Valor por forma: chave = FormaPagamentoValue, valor = string numérica
  const [valoresPorForma, setValoresPorForma] = useState<Partial<Record<FormaPagamentoValue, string>>>({})

  // Fiado (vale)
  const [valeNumero, setValeNumero] = useState("")
  const [vctoTipo, setVctoTipo] = useState<VctoTipo>("quinto")
  const [dataPagamentoVale, setDataPagamentoVale] = useState(quintoUtilMesSeguinte())

  // Vale Gás
  const [valeGasNumero, setValeGasNumero] = useState("")
  const [valeGasBlocoId, setValeGasBlocoId] = useState<string | null>(null)
  const [valeGasInfo, setValeGasInfo] = useState<ValeGasInfo | null>(null)
  const [validandoValeGas, setValidandoValeGas] = useState(false)

  // Gás do Povo
  const [gasPovoValorGov, setGasPovoValorGov] = useState("")
  const [gasPovoFrete, setGasPovoFrete] = useState("")

  // Data da venda
  const [dataVenda, setDataVenda] = useState(hojeISO())

  // Diálogo de resumo
  const [showResumo, setShowResumo] = useState(false)

  // ── Queries ──────────────────────────────────────────────────────────────
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

  // Seleciona distribuidora por padrão
  useEffect(() => {
    if (motoristaId || !users) return
    const dist = users.data.find((u) => u.full_name === NOME_DISTRIBUIDORA)
    if (dist) setMotoristaId(dist.id)
  }, [users, motoristaId])

  // Próximo número de vale (Fiado) ao selecionar
  useEffect(() => {
    if (!formasPagamento.includes("vale") || !motoristaId) return
    VendasService.readProximoNumeroVale({ motoristaId })
      .then((res) => {
        if (res.numero == null) return
        setValeNumero((atual) => (atual ? atual : String(res.numero)))
      })
      .catch(() => {})
  }, [formasPagamento, motoristaId])

  // Validação em tempo real do Vale Gás
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

  // Limpa campos ao remover forma exclusiva
  useEffect(() => {
    if (!formasPagamento.includes("gas_povo")) {
      setGasPovoValorGov("")
      setGasPovoFrete("")
    }
    if (!formasPagamento.includes("vale_gas")) {
      setValeGasNumero("")
      setValeGasInfo(null)
      setValeGasBlocoId(null)
    }
    if (!formasPagamento.includes("vale")) {
      setValeNumero("")
    }
  }, [formasPagamento])

  // Sincroniza cascos com sacola
  useEffect(() => {
    const ids = new Set(sacola.map((i) => i.produtoId))
    setCascos((prev) => prev.filter((c) => ids.has(c.produto_id)))
  }, [sacola])

  // ── Total da sacola ───────────────────────────────────────────────────────
  const totalSacola = sacola.reduce((acc, item) => {
    const gas = Number(item.precoUnitario) * item.quantidade
    const casco =
      item.comCasco && item.precoCascoAtual
        ? Number(item.precoCascoAtual) * item.quantidade
        : 0
    return acc + gas + casco
  }, 0)

  // Soma dos valores preenchidos por forma
  const somaFormas = formasPagamento.reduce((acc, f) => {
    return acc + (parseFloat(valoresPorForma[f] ?? "0") || 0)
  }, 0)

  // Cor do total: verde se soma >= sacola, âmbar se menor
  const totalOk = somaFormas >= totalSacola && formasPagamento.length > 0
  const totalColorClass = totalOk ? "text-[#00a63e]" : "text-amber-500"

  // ── Handlers de valor por forma ───────────────────────────────────────────
  const handleValorForma = (forma: FormaPagamentoValue, raw: string) => {
    const valor = parseFloat(raw) || 0
    setValoresPorForma((prev) => {
      const novo = { ...prev, [forma]: raw }

      // Auto-fill: se houver exatamente 2 formas, preenche o saldo na outra
      if (formasPagamento.length === 2) {
        const outra = formasPagamento.find((f) => f !== forma)
        if (outra) {
          const saldo = Math.max(0, totalSacola - valor)
          novo[outra] = saldo > 0 ? saldo.toFixed(2) : ""
        }
      }
      return novo
    })
  }

  // Ao mudar as formas selecionadas: inicializa valor da nova forma
  const handleFormasChange = (novas: FormaPagamentoValue[]) => {
    setFormasPagamento(novas)
    setValoresPorForma((prev) => {
      const novo: Partial<Record<FormaPagamentoValue, string>> = {}
      novas.forEach((f) => {
        // mantém valor existente; se forma nova e só tem 1 forma, preenche total
        if (prev[f] !== undefined) {
          novo[f] = prev[f]
        } else {
          novo[f] = novas.length === 1 ? totalSacola.toFixed(2) : ""
        }
      })
      return novo
    })
  }

  // ── Handlers da sacola ────────────────────────────────────────────────────
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
    setSacola((prev) =>
      prev.map((i) =>
        i.produtoId === produtoId ? { ...i, quantidade: i.quantidade + 1 } : i,
      ),
    )

  const handleDecrementar = (produtoId: string) => {
    setSacola((prev) =>
      prev.flatMap((i) => {
        if (i.produtoId !== produtoId) return [i]
        if (i.quantidade <= 1) return []
        return [{ ...i, quantidade: i.quantidade - 1 }]
      }),
    )
    setCascos((prev) =>
      prev
        .map((c) => {
          if (c.produto_id !== produtoId) return c
          const itemAtual = sacola.find((i) => i.produtoId === produtoId)
          const novaQtd = (itemAtual?.quantidade ?? 1) - 1
          return { ...c, quantidade: Math.min(c.quantidade, novaQtd) }
        })
        .filter((c) => c.quantidade > 0),
    )
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
    if (comCasco) setCascos((prev) => prev.filter((c) => c.produto_id !== produtoId))
  }

  // ── Vcto Fiado ────────────────────────────────────────────────────────────
  const handleVctoTipo = (tipo: VctoTipo) => {
    setVctoTipo(tipo)
    if (tipo === "quinto") setDataPagamentoVale(quintoUtilMesSeguinte())
    else if (tipo === "trinta") setDataPagamentoVale(trinta())
    // manual: mantém o campo editável
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  const resetForm = () => {
    setSacola([])
    setCascos([])
    setCliente(null)
    setEndereco(null)
    setFormasPagamento([])
    setValoresPorForma({})
    setValeNumero("")
    setVctoTipo("quinto")
    setDataPagamentoVale(quintoUtilMesSeguinte())
    setValeGasNumero("")
    setValeGasBlocoId(null)
    setValeGasInfo(null)
    setGasPovoValorGov("")
    setGasPovoFrete("")
    setDataVenda(hojeISO())
    setShowResumo(false)
  }

  // ── Validações ────────────────────────────────────────────────────────────
  const gasPovoValido =
    formasPagamento.includes("gas_povo") &&
    parseFloat(gasPovoValorGov) > 0 &&
    parseFloat(gasPovoFrete) > 0

  const gasPovoTotal =
    (parseFloat(gasPovoValorGov) || 0) + (parseFloat(gasPovoFrete) || 0)

  // Forma principal para envio ao backend (primeira da lista)
  const formaPrincipal = formasPagamento[0] ?? null

  // Valor total para envio: se gas_povo usa total gov+frete, senão soma das formas
  const valorPagoEnvio = formasPagamento.includes("gas_povo")
    ? String(gasPovoTotal)
    : somaFormas.toFixed(2)

  const podeFinalizar =
    !!cliente &&
    sacola.length > 0 &&
    !!motoristaId &&
    formasPagamento.length > 0 &&
    (!formasPagamento.includes("vale") || valeNumero.trim().length > 0) &&
    (!formasPagamento.includes("vale_gas") ||
      (valeGasNumero.trim().length > 0 && !!valeGasBlocoId)) &&
    (!formasPagamento.includes("gas_povo") || gasPovoValido)

  const handleAbrirResumo = () => {
    if (!cliente) return showErrorToast("Selecione ou cadastre um cliente")
    if (sacola.length === 0) return showErrorToast("Adicione ao menos 1 produto na sacola")
    if (formasPagamento.length === 0) return showErrorToast("Selecione a forma de pagamento")
    if (formasPagamento.includes("vale") && !valeNumero.trim())
      return showErrorToast("Informe o número do fiado")
    if (formasPagamento.includes("vale_gas") && !valeGasNumero.trim())
      return showErrorToast("Informe o número do vale gás")
    if (formasPagamento.includes("vale_gas") && !valeGasBlocoId)
      return showErrorToast("Número de vale gás inválido — verifique o estabelecimento")
    if (formasPagamento.includes("gas_povo") && !(parseFloat(gasPovoValorGov) > 0))
      return showErrorToast("Informe o valor do governo para Gás do Povo")
    if (formasPagamento.includes("gas_povo") && !(parseFloat(gasPovoFrete) > 0))
      return showErrorToast("Informe o valor do frete para Gás do Povo")
    setShowResumo(true)
  }

  // ── Mutation ──────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: () =>
      VendasService.createVenda({
        requestBody: {
          cliente_id: cliente?.id ?? "",
          endereco_id: endereco?.id,
          motorista_id: motoristaId,
          forma_pagamento: formaPrincipal as
            | "cartao_debito" | "cartao_credito" | "pix" | "dinheiro"
            | "vale" | "vale_gas" | "gas_povo",
          vale_numero:
            formasPagamento.includes("vale") && valeNumero
              ? Number(valeNumero)
              : undefined,
          data_pagamento_vale:
            formasPagamento.includes("vale") && dataPagamentoVale
              ? dataPagamentoVale
              : undefined,
          vale_gas_numero:
            formasPagamento.includes("vale_gas") && valeGasNumero
              ? Number(valeGasNumero)
              : undefined,
          vale_gas_bloco_id: formasPagamento.includes("vale_gas")
            ? (valeGasBlocoId ?? undefined)
            : undefined,
          gas_povo_frete:
            formasPagamento.includes("gas_povo") && gasPovoFrete
              ? gasPovoFrete
              : undefined,
          valor_pago: valorPagoEnvio,
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

  // ── Helpers de render ─────────────────────────────────────────────────────
  const motoristaNome =
    usuariosCombo.find((u) => u.id === motoristaId)?.full_name ||
    usuariosCombo.find((u) => u.id === motoristaId)?.email ||
    ""

  // Total exibido: gas_povo usa gov+frete, demais usa soma das formas (ou sacola se vazio)
  const totalExibido = formasPagamento.includes("gas_povo")
    ? gasPovoTotal
    : somaFormas > 0
      ? somaFormas
      : totalSacola

  const totalFormatado = formatMoney(totalExibido)

  // ── Render ────────────────────────────────────────────────────────────────
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

      {/* Grid principal */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">

        {/* ── Coluna ESQUERDA ── */}
        <div className="flex flex-col gap-6">

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
            <p className="mb-2 text-sm font-medium">Produtos</p>
            <ProdutoGrid
              produtos={produtos}
              quantidadesNaSacola={quantidadesNaSacola}
              onSelect={handleSelectProduto}
            />
          </div>

          {/* Grade de botões de forma de pagamento */}
          <FormaPagamento
            value={formasPagamento}
            onChange={handleFormasChange}
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
          <PainelCasco itens={sacola} cascos={cascos} onChange={setCascos} />

          {/* ── Valores por forma de pagamento ── */}
          {formasPagamento.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border p-3">

              {/* Gás do Povo: campos especiais */}
              {formasPagamento.includes("gas_povo") && (
                <>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Gás do Povo</p>
                  <div className="rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 px-3 py-2">
                    <p className="text-xs text-blue-800 dark:text-blue-200">
                      O governo paga depois. O frete é cobrado do cliente no ato.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="gas-povo-valor-gov">Valor governo (R$)</Label>
                      <Input
                        id="gas-povo-valor-gov"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={gasPovoValorGov}
                        onChange={(e) => setGasPovoValorGov(e.target.value)}
                        placeholder="0,00"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="gas-povo-frete">Frete cliente (R$)</Label>
                      <Input
                        id="gas-povo-frete"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={gasPovoFrete}
                        onChange={(e) => setGasPovoFrete(e.target.value)}
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Vale Gás: campos especiais */}
              {formasPagamento.includes("vale_gas") && (
                <>
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
                  {validandoValeGas && (
                    <p className="text-xs text-muted-foreground">Verificando...</p>
                  )}
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

              {/* Formas normais: uma linha por forma com campo de valor */}
              {formasPagamento
                .filter((f) => !FORMAS_EXCLUSIVAS.includes(f))
                .map((forma) => (
                  <div key={forma} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Label className="w-20 shrink-0 text-sm">{LABEL_FORMA[forma]}</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={valoresPorForma[forma] ?? ""}
                        onChange={(e) => handleValorForma(forma, e.target.value)}
                        placeholder="R$ 0,00"
                        className="flex-1"
                      />
                    </div>

                    {/* Fiado: campos extras inline */}
                    {forma === "vale" && (
                      <div className="ml-[5.5rem] flex flex-col gap-2 border-l-2 border-border pl-3">
                        <div className="grid gap-1.5">
                          <Label htmlFor="vale-numero" className="text-xs text-muted-foreground">
                            Número da folha (bloco)
                          </Label>
                          <Input
                            id="vale-numero"
                            type="number"
                            inputMode="numeric"
                            value={valeNumero}
                            onChange={(e) => setValeNumero(e.target.value)}
                            placeholder="Ex: 47"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <p className="text-xs text-muted-foreground">Vencimento</p>
                          {/* Radio checkboxes mutuamente exclusivos */}
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="vcto-tipo"
                              checked={vctoTipo === "quinto"}
                              onChange={() => handleVctoTipo("quinto")}
                              className="accent-primary"
                            />
                            <span className="text-xs text-muted-foreground">5º dia útil do mês seguinte</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="vcto-tipo"
                              checked={vctoTipo === "trinta"}
                              onChange={() => handleVctoTipo("trinta")}
                              className="accent-primary"
                            />
                            <span className="text-xs text-muted-foreground">30 dias a partir de hoje</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="vcto-tipo"
                              checked={vctoTipo === "manual"}
                              onChange={() => handleVctoTipo("manual")}
                              className="accent-primary"
                            />
                            <span className="text-xs text-muted-foreground">Data manual</span>
                          </label>
                        </div>
                        <Input
                          type="date"
                          value={dataPagamentoVale}
                          onChange={(e) => {
                            setDataPagamentoVale(e.target.value)
                            setVctoTipo("manual")
                          }}
                          className="h-8 text-sm"
                        />
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}

          {/* Data da venda */}
          <div className="rounded-lg border p-3">
            <div className="grid gap-1.5">
              <Label htmlFor="data-venda">Data da venda</Label>
              <Input
                id="data-venda"
                type="date"
                value={dataVenda}
                onChange={(e) => setDataVenda(e.target.value)}
              />
            </div>
          </div>

          {/* Total + Finalizar */}
          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Total</span>
              <span className={`text-xl font-bold ${formasPagamento.length > 0 ? totalColorClass : ""}`}>
                {totalFormatado}
              </span>
            </div>
            {/* Referência da sacola quando há mix */}
            {formasPagamento.length > 1 && somaFormas !== totalSacola && (
              <p className="text-xs text-muted-foreground text-right">
                Sacola: {formatMoney(totalSacola)}
              </p>
            )}
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
        formaPagamento={formaPrincipal ?? ""}
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
