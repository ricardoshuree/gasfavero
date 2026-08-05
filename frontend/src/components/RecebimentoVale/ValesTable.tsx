// [mcp-local harness] feature: recebimento-vale-frontend | plano: 18bab2b5 | 2026-08-05 15:54:13
// Tabela paginada/ordenavel de vendas em vale pendentes
// Tabela da tela /recebimento-vale -- server-side (paginacao,
// ordenacao e busca acontecem via query params no backend, nao no
// tanstack-table client-side), por isso nao reaproveita o
// components/Common/DataTable genérico (que só pagina em memória).
import { useQuery } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react"

import { VendasService } from "@/client"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"

type OrderBy = "data_venda" | "valor_total" | "cliente"
type OrderDir = "asc" | "desc"
type Status = "aberto" | "aguardando_baixa"

const PAGE_SIZE = 20

function formatMoney(valor: string | number): string {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

function formatDate(iso: string): string {
  const [ano, mes, dia] = iso.split("-")
  return `${dia}/${mes}/${ano}`
}

interface ValesTableProps {
  status: Status
  buscaNumero: number | undefined
  page: number
  onPageChange: (page: number) => void
  orderBy: OrderBy
  orderDir: OrderDir
  onSortChange: (orderBy: OrderBy, orderDir: OrderDir) => void
  onRowClick: (vendaId: string) => void
}

export function ValesTable({
  status,
  buscaNumero,
  page,
  onPageChange,
  orderBy,
  orderDir,
  onSortChange,
  onRowClick,
}: ValesTableProps) {
  const { data, isFetching } = useQuery({
    queryKey: [
      "valesRecebimento",
      status,
      buscaNumero,
      page,
      orderBy,
      orderDir,
    ],
    queryFn: () =>
      VendasService.readValesRecebimento({
        status,
        buscaNumero: buscaNumero,
        orderBy,
        orderDir,
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      }),
  })

  const vendas = data?.data ?? []
  const count = data?.count ?? 0
  const totalPaginas = Math.max(1, Math.ceil(count / PAGE_SIZE))

  function toggleSort(coluna: OrderBy) {
    if (orderBy !== coluna) {
      onSortChange(coluna, "desc")
      return
    }
    onSortChange(coluna, orderDir === "desc" ? "asc" : "desc")
  }

  function SortIcon({ coluna }: { coluna: OrderBy }) {
    if (orderBy !== coluna) {
      return <ArrowUpDown className="ml-1 inline size-3 text-muted-foreground" />
    }
    return orderDir === "desc" ? (
      <ArrowDown className="ml-1 inline size-3" />
    ) : (
      <ArrowUp className="ml-1 inline size-3" />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => toggleSort("cliente")}
              >
                Cliente
                <SortIcon coluna="cliente" />
              </TableHead>
              <TableHead>Endereço</TableHead>
              <TableHead>Vale nº</TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => toggleSort("data_venda")}
              >
                Data venda
                <SortIcon coluna="data_venda" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => toggleSort("valor_total")}
              >
                Valor
                <SortIcon coluna="valor_total" />
              </TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendas.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={6}
                  className="h-32 text-center text-muted-foreground"
                >
                  {isFetching ? "Carregando..." : "Nenhum vale encontrado"}
                </TableCell>
              </TableRow>
            ) : (
              vendas.map((venda) => (
                <TableRow
                  key={venda.id}
                  className="cursor-pointer"
                  onClick={() => onRowClick(venda.id)}
                >
                  <TableCell>{venda.cliente_nome}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {venda.endereco
                      ? `${venda.endereco.rua_nome}, ${venda.endereco.numero} — ${venda.endereco.bairro_nome}`
                      : "—"}
                  </TableCell>
                  <TableCell>{venda.vale_numero ?? "—"}</TableCell>
                  <TableCell>{formatDate(venda.data_venda)}</TableCell>
                  <TableCell className="text-right">
                    {formatMoney(venda.valor_total)}
                  </TableCell>
                  <TableCell>
                    {venda.recebido_em ? (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-800">
                        Aguardando baixa
                      </span>
                    ) : (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        Em aberto
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between px-1 text-sm text-muted-foreground">
          <span>
            Página {page + 1} de {totalPaginas} · {count} vales
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page === 0}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page + 1 >= totalPaginas}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ValesTable
