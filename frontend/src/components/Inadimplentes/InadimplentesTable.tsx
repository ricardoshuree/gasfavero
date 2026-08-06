// [mcp-local harness] feature: inadimplentes-frontend | plano: 6d31605b | 2026-08-06 12:53:03
// Dropdown Nome Motorista (Todos Motoristas primeiro), tabela ordenada por data mais antiga, totais no rodape, Exportar PDF via jspdf/jspdf-autotable (import dinamico)
// Tabela de Inadimplentes -- TODAS as vendas 'esteve em atraso' (ver
// backend), independente do menu Ano/Mês do topo. Só filtro de
// motorista (dropdown, "Todos Motoristas" primeiro) -- sem filtro de
// data própria (diferente do Livro de Vendas). Ordenada por data de
// venda mais ANTIGA primeiro. Rodapé com totais + botão "Exportar
// PDF" (gera o PDF 100% no navegador com jspdf/jspdf-autotable,
// respeitando o filtro de motorista ativo, sem paginação).
import { useQuery } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, FileDown } from "lucide-react"
import { useState } from "react"

import { type VendaPublic, VendasService } from "@/client"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

const PAGE_SIZE = 20
const DIAS_ATRASO_VALE = 30
const TODOS_MOTORISTAS = "todos"

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

function statusTexto(venda: VendaPublic): string {
  if (venda.pago_em) return "Pago"
  if (venda.forma_pagamento === "vale" && isAtrasado(venda.data_venda))
    return "Em atraso"
  return "Em aberto"
}

function StatusBadge({ venda }: { venda: VendaPublic }) {
  const texto = statusTexto(venda)
  if (texto === "Pago") {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
        Pago
      </span>
    )
  }
  if (texto === "Em atraso") {
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

function enderecoTexto(venda: VendaPublic): string {
  if (!venda.endereco) return "—"
  return `${venda.endereco.rua_nome}, ${venda.endereco.numero} — ${venda.endereco.bairro_nome}`
}

export function InadimplentesTable() {
  const [motoristaId, setMotoristaId] = useState<string>(TODOS_MOTORISTAS)
  const [page, setPage] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const { showErrorToast } = useCustomToast()

  const { data: motoristasData } = useQuery({
    queryKey: ["inadimplentesMotoristas"],
    queryFn: () => VendasService.readInadimplentesMotoristas(),
  })

  const { data, isFetching } = useQuery({
    queryKey: ["inadimplentes", motoristaId, page],
    queryFn: () =>
      VendasService.readInadimplentes({
        motoristaId:
          motoristaId === TODOS_MOTORISTAS ? undefined : motoristaId,
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      }),
  })

  function handleMotoristaChange(value: string) {
    setMotoristaId(value)
    setPage(0)
  }

  const vendas = data?.data ?? []
  const count = data?.count ?? 0
  const totalPaginas = Math.max(1, Math.ceil(count / PAGE_SIZE))

  async function handleExportarPdf() {
    setIsExporting(true)
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ])

      // Busca TODO o conjunto filtrado (sem paginação) na hora de
      // exportar -- o PDF reflete o filtro de motorista ativo, não
      // só a página visível na tela.
      const completo = await VendasService.readInadimplentes({
        motoristaId:
          motoristaId === TODOS_MOTORISTAS ? undefined : motoristaId,
        skip: 0,
        limit: 10000,
      })

      const doc = new jsPDF({ orientation: "landscape" })
      doc.setFontSize(16)
      doc.text("Inadimplentes", 14, 15)
      doc.setFontSize(10)
      doc.setTextColor(120)
      const agora = new Date()
      doc.text(
        `Impresso em ${agora.toLocaleDateString("pt-BR")} ${agora.toLocaleTimeString("pt-BR")}`,
        14,
        21,
      )

      autoTable(doc, {
        startY: 26,
        head: [
          [
            "Nome cliente",
            "Endereço",
            "Tipo pagamento",
            "Data venda",
            "Data pagamento",
            "Preço",
            "Valor pago",
            "Motorista",
            "Status",
          ],
        ],
        body: completo.data.map((v) => [
          v.cliente_nome,
          enderecoTexto(v),
          LABEL_FORMA_PAGAMENTO[v.forma_pagamento] ?? v.forma_pagamento,
          formatDate(v.data_venda),
          formatDate(v.pago_em ?? v.data_pagamento_vale),
          formatMoney(v.valor_total),
          formatMoney(v.valor_pago),
          v.motorista_nome,
          statusTexto(v),
        ]),
        foot: [
          [
            "",
            "",
            "",
            "",
            "Total",
            formatMoney(completo.soma_preco),
            formatMoney(completo.soma_valor_pago),
            "",
            "",
          ],
        ],
        styles: { fontSize: 8 },
        headStyles: { fillColor: [40, 40, 40] },
        footStyles: { fillColor: [230, 230, 230], textColor: 20 },
      })

      doc.save("inadimplentes.pdf")
    } catch {
      showErrorToast("Não foi possível gerar o PDF")
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">Seleciona por Motorista</p>
          <label htmlFor="inadimplentes-motorista" className="sr-only">
            Nome Motorista
          </label>
          <Select value={motoristaId} onValueChange={handleMotoristaChange}>
            <SelectTrigger id="inadimplentes-motorista" className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS_MOTORISTAS}>
                Todos Motoristas
              </SelectItem>
              {motoristasData?.data.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={handleExportarPdf}
          disabled={isExporting}
        >
          <FileDown className="size-4" />
          {isExporting ? "Gerando..." : "Exportar PDF"}
        </Button>
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
              <TableHead>Motorista</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendas.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={9}
                  className="h-32 text-center text-muted-foreground"
                >
                  {isFetching
                    ? "Carregando..."
                    : "Nenhum inadimplente encontrado"}
                </TableCell>
              </TableRow>
            ) : (
              vendas.map((venda) => (
                <TableRow key={venda.id}>
                  <TableCell>{venda.cliente_nome}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {enderecoTexto(venda)}
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
                  <TableCell>{venda.motorista_nome}</TableCell>
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
                <TableCell colSpan={5} className="text-right font-semibold">
                  Total
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {formatMoney(data?.soma_preco ?? 0)}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {formatMoney(data?.soma_valor_pago ?? 0)}
                </TableCell>
                <TableCell colSpan={2} />
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

export default InadimplentesTable
