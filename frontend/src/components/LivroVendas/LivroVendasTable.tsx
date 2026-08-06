// [mcp-local harness] feature: livro-vendas-totais-tabela | plano: 20e0e2dd | 2026-08-06 10:32:28
// Adiciona TableFooter com linha de totais (soma_preco/soma_valor_pago do backend), dinamica com o filtro de data
// Tabela do Livro de Vendas -- TODAS as vendas (qualquer forma de
// pagamento), independente do menu interativo (ano/mês/semana) do
// topo da tela. Filtro próprio de intervalo de datas (Início/Fim +
// botão Buscar), paginada, ordenada por data de venda mais recente
// primeiro. Server-side (não usa o DataTable genérico, que só pagina
// em memória) -- mesmo padrão da ValesTable de Recebimento de Vale.
//
// Rodapé com linha de totais (soma de "Preço" e "Valor pago") --
// soma_preco/soma_valor_pago vêm do backend já calculados sobre TODO
// o conjunto que bate com o filtro de data ativo (não só a página
// atual), então a linha de totais muda dinamicamente junto com
// "Consulta vendas data" mas não com a paginação.
import { useQuery } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, Search } from "lucide-react"
import { useState } from "react"

import { VendasService } from "@/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const PAGE_SIZE = 20

// Mesmo limite usado no backend (DIAS_ATRASO_VALE em vendas.py) --
// contado a partir de data_venda, só pra decidir o texto do status.
const DIAS_ATRASO_VALE = 30

const LABEL_FORMA_PAGAMENTO: Record<string, string> = {
  cartao: "Cartão",
  pix: "Pix",
  dinheiro: "Dinheiro",
  vale: "Vale",
}

function formatMoney(valor: string | number): string {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const [ano, mes, dia] = iso.slice(0, 10).split("-")
  return `${dia}/${mes}/${ano}`
}

function isAtrasado(dataVendaISO: string): boolean {
  const dataVenda = new Date(`${dataVendaISO}T00:00:00`)
  const limite = new Date()
  limite.setHours(0, 0, 0, 0)
  limite.setDate(limite.getDate() - DIAS_ATRASO_VALE)
  return dataVenda <= limite
}

function StatusBadge({
  pagoEm,
  formaPagamento,
  dataVenda,
}: {
  pagoEm: string | null | undefined
  formaPagamento: string
  dataVenda: string
}) {
  if (pagoEm) {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
        Pago
      </span>
    )
  }
  if (formaPagamento === "vale" && isAtrasado(dataVenda)) {
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

export function LivroVendasTable() {
  const [inicioInput, setInicioInput] = useState("")
  const [fimInput, setFimInput] = useState("")
  const [filtro, setFiltro] = useState<{ inicio: string; fim: string }>({
    inicio: "",
    fim: "",
  })
  const [page, setPage] = useState(0)

  function handleBuscar() {
    setFiltro({ inicio: inicioInput, fim: fimInput })
    setPage(0)
  }

  const { data, isFetching } = useQuery({
    queryKey: ["livroVendas", filtro.inicio, filtro.fim, page],
    queryFn: () =>
      VendasService.readLivroVendas({
        dataInicio: filtro.inicio || undefined,
        dataFim: filtro.fim || undefined,
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      }),
  })

  const vendas = data?.data ?? []
  const count = data?.count ?? 0
  const totalPaginas = Math.max(1, Math.ceil(count / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Consulta vendas data</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="livro-data-inicio" className="text-xs">
              Início
            </Label>
            <Input
              id="livro-data-inicio"
              type="date"
              value={inicioInput}
              onChange={(e) => setInicioInput(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="livro-data-fim" className="text-xs">
              Fim
            </Label>
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
                <TableCell
                  colSpan={8}
                  className="h-32 text-center text-muted-foreground"
                >
                  {isFetching ? "Carregando..." : "Nenhuma venda encontrada"}
                </TableCell>
              </TableRow>
            ) : (
              vendas.map((venda) => (
                <TableRow key={venda.id}>
                  <TableCell>{venda.cliente_nome}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {venda.endereco
                      ? `${venda.endereco.rua_nome}, ${venda.endereco.numero} — ${venda.endereco.bairro_nome}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {LABEL_FORMA_PAGAMENTO[venda.forma_pagamento] ??
                      venda.forma_pagamento}
                  </TableCell>
                  <TableCell>{formatDate(venda.data_venda)}</TableCell>
                  <TableCell>
                    {formatDate(venda.pago_em ?? venda.data_pagamento_vale)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatMoney(venda.valor_total)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatMoney(venda.valor_pago)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      pagoEm={venda.pago_em}
                      formaPagamento={venda.forma_pagamento}
                      dataVenda={venda.data_venda}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {vendas.length > 0 && (
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="text-right font-semibold">
                  Total
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {formatMoney(data?.soma_preco ?? 0)}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {formatMoney(data?.soma_valor_pago ?? 0)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between px-1 text-sm text-muted-foreground">
          <span>
            Página {page + 1} de {totalPaginas} · {count} vendas
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page + 1 >= totalPaginas}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default LivroVendasTable
