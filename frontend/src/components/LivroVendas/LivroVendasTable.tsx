// [mcp-local harness] feature: panel-cancelar-edicao | plano: 17e37098 | 2026-09-06 01:20:27
// Adiciona botao Cancelar edicao laranja; dialog de confirmacao de cancelamento mais destacado com borda e icone; botao Fechar para vendas canceladas
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, ChevronLeft, ChevronRight, Search, XCircle } from "lucide-react"
import { useState } from "react"

import { type VendaPublic, VendasService } from "@/client"
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import useCustomToast from "@/hooks/useCustomToast"
import { usePermissions } from "@/hooks/usePermissions"

const PAGE_SIZE = 20
const DIAS_ATRASO_VALE = 30

const LABEL_FORMA_PAGAMENTO: Record<string, string> = {
  cartao_debito:  "Cartão Débito",
  cartao_credito: "Cartão Crédito",
  pix:            "Pix",
  dinheiro:       "Dinheiro",
  vale:           "Fiado",
  vale_gas:       "Vale Gás",
  gas_povo:       "Gás do Povo",
}

const FORMAS_SIMPLES = ["cartao_debito", "cartao_credito", "pix", "dinheiro"]

type StatusFiltro = "todos" | "pago" | "em_aberto" | "em_atraso"

const STATUS_OPTIONS: Array<{ value: StatusFiltro; label: string }> = [
  { value: "todos",     label: "Todos os status" },
  { value: "pago",      label: "Pago" },
  { value: "em_aberto", label: "Em aberto" },
  { value: "em_atraso", label: "Em atraso" },
]

function formatMoney(valor: string | number): string {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const [ano, mes, dia] = iso.slice(0, 10).split("-")
  return `${dia}/${mes}/${ano}`
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("pt-BR")
}

function isAtrasado(dataVendaISO: string): boolean {
  const dataVenda = new Date(`${dataVendaISO}T00:00:00`)
  const limite = new Date()
  limite.setHours(0, 0, 0, 0)
  limite.setDate(limite.getDate() - DIAS_ATRASO_VALE)
  return dataVenda <= limite
}

function StatusBadge({ venda }: { venda: VendaPublic }) {
  if (venda.status === "cancelada") {
    return (
      <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-medium text-white">
        Cancelada
      </span>
    )
  }
  if (venda.pago_em) {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
        Pago
      </span>
    )
  }
  if (venda.forma_pagamento === "vale" && isAtrasado(venda.data_venda)) {
    return (
      <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs text-destructive">
        Em atraso
      </span>
    )
  }
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      Em aberto
    </span>
  )
}

function primeiroDiaMesAtualISO(): string {
  const hoje = new Date()
  const y = hoje.getFullYear()
  const m = String(hoje.getMonth() + 1).padStart(2, "0")
  return `${y}-${m}-01`
}

function ultimoDiaMesAtualISO(): string {
  const hoje = new Date()
  const y = hoje.getFullYear()
  const ultimoDia = new Date(y, hoje.getMonth() + 1, 0).getDate()
  const m = String(hoje.getMonth() + 1).padStart(2, "0")
  return `${y}-${m}-${String(ultimoDia).padStart(2, "0")}`
}

// ---------------------------------------------------------------------------
// Panel lateral de edicao
// ---------------------------------------------------------------------------

function VendaEditPanel({
  venda,
  onClose,
  canEdit,
}: {
  venda: VendaPublic
  onClose: () => void
  canEdit: boolean
}) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const [formaPagamento, setFormaPagamento] = useState(venda.forma_pagamento)
  const [valorPago, setValorPago] = useState(String(venda.valor_pago))
  const [dataVenda, setDataVenda] = useState(venda.data_venda)
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false)

  const isCancelada = venda.status === "cancelada"
  const formaAtualEhSimples = FORMAS_SIMPLES.includes(venda.forma_pagamento)
  const trocouParaComplexo = !FORMAS_SIMPLES.includes(formaPagamento) && formaPagamento !== venda.forma_pagamento
  const qtdEdicoes = venda.qtd_edicoes ?? 0

  // Verifica se houve alguma alteracao nos campos
  const houveAlteracao =
    formaPagamento !== venda.forma_pagamento ||
    valorPago !== String(venda.valor_pago) ||
    dataVenda !== venda.data_venda

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["livroVendas"] })
    queryClient.invalidateQueries({ queryKey: ["livroResumo"] })
  }

  const mutEditar = useMutation({
    mutationFn: () =>
      VendasService.editarVenda({
        id: venda.id,
        requestBody: {
          forma_pagamento: formaPagamento !== venda.forma_pagamento ? formaPagamento : undefined,
          valor_pago: valorPago !== String(venda.valor_pago) ? valorPago : undefined,
          data_venda: dataVenda !== venda.data_venda ? dataVenda : undefined,
        },
      }),
    onSuccess: () => {
      showSuccessToast("Venda atualizada")
      invalidateQueries()
      onClose()
    },
    onError: (err: any) => {
      showErrorToast(err?.body?.detail ?? "Erro ao editar venda")
    },
  })

  const mutCancelar = useMutation({
    mutationFn: () => VendasService.cancelarVenda({ id: venda.id }),
    onSuccess: () => {
      showSuccessToast("Venda cancelada e estorno lançado")
      invalidateQueries()
      onClose()
    },
    onError: (err: any) => {
      showErrorToast(err?.body?.detail ?? "Erro ao cancelar venda")
    },
  })

  return (
    <div className="flex flex-col gap-5 p-1">

      {/* Dados da venda */}
      <div className="rounded-lg border bg-muted/30 p-3 flex flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Cliente</span>
          <span className="font-medium">{venda.cliente_nome}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Motorista</span>
          <span>{venda.motorista_nome}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Itens</span>
          <span>{venda.itens?.map(i => `${i.quantidade}x ${i.produto_title}`).join(", ")}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Preço catálogo</span>
          <span>{formatMoney(venda.valor_total)}</span>
        </div>
        {qtdEdicoes > 0 && (
          <div className="flex justify-between items-center mt-1">
            <span className="text-muted-foreground">Edições</span>
            <span className="flex items-center gap-1 text-amber-600 text-xs font-medium">
              <AlertTriangle className="h-3.5 w-3.5" />
              {qtdEdicoes} edição(ões)
            </span>
          </div>
        )}
      </div>

      {/* Status cancelada */}
      {isCancelada && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
          <p className="text-sm font-medium text-destructive">Venda cancelada</p>
          <p className="text-xs text-destructive/80">
            por {venda.cancelada_por_nome ?? "?"} em {formatDateTime(venda.cancelada_em)}
          </p>
        </div>
      )}

      {/* Formulario de edicao */}
      {!isCancelada && canEdit && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="ep-forma">Forma de pagamento</Label>
            <Select value={formaPagamento} onValueChange={setFormaPagamento}>
              <SelectTrigger id="ep-forma">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(LABEL_FORMA_PAGAMENTO).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {trocouParaComplexo && (
              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 mt-1">
                <p className="text-xs text-amber-800">
                  ⚠️ Para alterar para {LABEL_FORMA_PAGAMENTO[formaPagamento]}, cancele esta venda e registre uma nova.
                </p>
              </div>
            )}
            {!formaAtualEhSimples && (
              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 mt-1">
                <p className="text-xs text-amber-800">
                  ⚠️ Vendas em {LABEL_FORMA_PAGAMENTO[venda.forma_pagamento]} não permitem troca de forma de pagamento. Para alterar, cancele e registre uma nova.
                </p>
              </div>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="ep-valor">Valor pago (R$)</Label>
            <Input
              id="ep-valor"
              type="number"
              step="0.01"
              min="0"
              value={valorPago}
              onChange={(e) => setValorPago(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="ep-data">Data da venda</Label>
            <Input
              id="ep-data"
              type="date"
              value={dataVenda}
              onChange={(e) => setDataVenda(e.target.value)}
            />
          </div>

          {/* Botoes de acao da edicao */}
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => mutEditar.mutate()}
              disabled={mutEditar.isPending || trocouParaComplexo || !houveAlteracao}
            >
              {mutEditar.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
            {/* Cancelar edicao — laranja — fecha o panel sem salvar */}
            <Button
              onClick={onClose}
              disabled={mutEditar.isPending}
              style={{ backgroundColor: "#f97316", color: "#fff", borderColor: "#f97316" }}
            >
              Cancelar edição
            </Button>
          </div>
        </div>
      )}

      {/* Log de edicoes */}
      {venda.logs_edicao && venda.logs_edicao.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Histórico de edições</p>
          <div className="flex flex-col gap-1.5">
            {venda.logs_edicao.map((log) => (
              <div key={log.id} className="rounded border bg-muted/20 px-3 py-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-medium">{log.campo}</span>
                  <span className="text-muted-foreground">{formatDateTime(log.editado_em.toString())}</span>
                </div>
                <div className="text-muted-foreground">
                  <span className="line-through">{log.valor_anterior}</span>
                  {" → "}
                  <span className="text-foreground">{log.valor_novo}</span>
                </div>
                <div className="text-muted-foreground">por {log.editado_por_nome ?? "?"}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cancelamento da venda */}
      {!isCancelada && canEdit && (
        <div className="border-t pt-4 mt-2">
          {!confirmandoCancelamento ? (
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => setConfirmandoCancelamento(true)}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cancelar venda
            </Button>
          ) : (
            /* Dialog de confirmacao inline */
            <div className="flex flex-col gap-3 rounded-lg border-2 border-destructive bg-destructive/5 p-4">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-destructive shrink-0" />
                <p className="text-sm font-semibold text-destructive">Tem certeza que deseja cancelar esta venda?</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Esta ação <strong>não pode ser desfeita</strong>. A venda será marcada como cancelada e o estorno contábil será lançado automaticamente.
              </p>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <Button
                  variant="destructive"
                  onClick={() => mutCancelar.mutate()}
                  disabled={mutCancelar.isPending}
                >
                  {mutCancelar.isPending ? "Cancelando..." : "Sim, cancelar"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setConfirmandoCancelamento(false)}
                  disabled={mutCancelar.isPending}
                >
                  Não, voltar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Botao fechar para vendas canceladas (sem edicao) */}
      {(isCancelada || !canEdit) && (
        <Button variant="outline" onClick={onClose}>
          Fechar
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tabela principal
// ---------------------------------------------------------------------------

export function LivroVendasTable() {
  const [inicioInput, setInicioInput] = useState(primeiroDiaMesAtualISO())
  const [fimInput, setFimInput] = useState(ultimoDiaMesAtualISO())
  const [filtro, setFiltro] = useState<{ inicio: string; fim: string }>({
    inicio: primeiroDiaMesAtualISO(),
    fim: ultimoDiaMesAtualISO(),
  })
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("todos")
  const [page, setPage] = useState(0)
  const [vendaSelecionada, setVendaSelecionada] = useState<VendaPublic | null>(null)

  const { canUpdate } = usePermissions()
  const canEdit = canUpdate("vendas")

  const { showErrorToast } = useCustomToast()

  function handleBuscar() {
    setFiltro({ inicio: inicioInput, fim: fimInput })
    setPage(0)
  }

  function handleStatusChange(value: StatusFiltro) {
    setStatusFiltro(value)
    setPage(0)
  }

  async function handleRowClick(venda: VendaPublic) {
    try {
      const fresh = await VendasService.readVenda({ id: venda.id })
      setVendaSelecionada(fresh)
    } catch {
      showErrorToast("Erro ao carregar venda")
    }
  }

  const { data, isFetching } = useQuery({
    queryKey: ["livroVendas", filtro.inicio, filtro.fim, statusFiltro, page],
    queryFn: () =>
      VendasService.readLivroVendas({
        dataInicio: filtro.inicio || undefined,
        dataFim: filtro.fim || undefined,
        status: statusFiltro,
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      }),
  })

  const vendas = data?.data ?? []
  const count = data?.count ?? 0
  const totalPaginas = Math.max(1, Math.ceil(count / PAGE_SIZE))

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Consultar vendas por datas</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="livro-data-inicio" className="text-xs">Início</Label>
              <Input
                id="livro-data-inicio"
                type="date"
                value={inicioInput}
                onChange={(e) => setInicioInput(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="livro-data-fim" className="text-xs">Fim</Label>
              <Input
                id="livro-data-fim"
                type="date"
                value={fimInput}
                onChange={(e) => setFimInput(e.target.value)}
                className="w-40"
              />
            </div>
            <Button type="button" onClick={handleBuscar} size="icon">
              <Search className="size-4" />
            </Button>
            <div className="flex flex-col gap-1">
              <Label htmlFor="livro-status" className="text-xs">Status</Label>
              <Select value={statusFiltro} onValueChange={handleStatusChange}>
                <SelectTrigger id="livro-status" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Nome cliente</TableHead>
                <TableHead>Endereço</TableHead>
                <TableHead>Tipo pagamento</TableHead>
                <TableHead>Data venda</TableHead>
                <TableHead>Data pagamento</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-right">Valor pago</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendas.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    {isFetching ? "Carregando..." : "Nenhuma venda encontrada"}
                  </TableCell>
                </TableRow>
              ) : (
                vendas.map((venda) => (
                  <TableRow
                    key={venda.id}
                    className="cursor-pointer"
                    onClick={() => handleRowClick(venda)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className={venda.status === "cancelada" ? "line-through text-muted-foreground" : ""}>
                          {venda.cliente_nome}
                        </span>
                        {(venda.qtd_edicoes ?? 0) > 0 && venda.status !== "cancelada" && (
                          <span className="text-amber-500" title={`${venda.qtd_edicoes} edição(ões)`}>
                            <AlertTriangle className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {venda.endereco
                        ? `${venda.endereco.rua_nome}, ${venda.endereco.numero} — ${venda.endereco.bairro_nome}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {LABEL_FORMA_PAGAMENTO[venda.forma_pagamento] ?? venda.forma_pagamento}
                    </TableCell>
                    <TableCell>{formatDate(venda.data_venda)}</TableCell>
                    <TableCell>
                      {formatDate(venda.pago_em ?? venda.data_pagamento_vale)}
                    </TableCell>
                    <TableCell className="text-right">{formatMoney(venda.valor_total)}</TableCell>
                    <TableCell className="text-right">{formatMoney(venda.valor_pago)}</TableCell>
                    <TableCell>
                      <StatusBadge venda={venda} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {vendas.length > 0 && (
              <TableFooter>
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="text-right font-semibold">Total</TableCell>
                  <TableCell className="text-right font-semibold">{formatMoney(data?.soma_preco ?? 0)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatMoney(data?.soma_valor_pago ?? 0)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>

        {totalPaginas > 1 && (
          <div className="flex items-center justify-between px-1 text-sm text-muted-foreground">
            <span>Página {page + 1} de {totalPaginas} · {count} vendas</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="outline" size="icon-sm" disabled={page + 1 >= totalPaginas} onClick={() => setPage(page + 1)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Sheet open={!!vendaSelecionada} onOpenChange={(open) => { if (!open) setVendaSelecionada(null) }}>
        <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>
              {vendaSelecionada?.status === "cancelada" ? "Venda cancelada" : "Detalhes da venda"}
            </SheetTitle>
          </SheetHeader>
          {vendaSelecionada && (
            <VendaEditPanel
              venda={vendaSelecionada}
              onClose={() => setVendaSelecionada(null)}
              canEdit={canEdit}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

export default LivroVendasTable
