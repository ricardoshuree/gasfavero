// [mcp-local harness] feature: recebimento-vale-frontend | plano: 18bab2b5 | 2026-08-05 15:54:55
// Rota /recebimento-vale que junta cards, tabela e painel de detalhe
// Pagina /recebimento-vale -- gate via modulo 'vendas' (mesma
// permissao das outras telas de venda). Dashboard + tabela filtravel/
// paginada + painel de detalhe com o fluxo Pago -> Baixa.
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Search } from "lucide-react"
import { useState } from "react"

import { UsersService } from "@/client"
import { Input } from "@/components/ui/input"
import DetalheValeSheet from "@/components/RecebimentoVale/DetalheValeSheet"
import ResumoCards from "@/components/RecebimentoVale/ResumoCards"
import ValesTable from "@/components/RecebimentoVale/ValesTable"

const MODULE = "vendas"

type Status = "aberto" | "aguardando_baixa"
type OrderBy = "data_venda" | "valor_total" | "cliente"
type OrderDir = "asc" | "desc"

export const Route = createFileRoute("/_layout/recebimento-vale")({
  component: RecebimentoVale,
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
    meta: [
      {
        title: "Recebimento de Vale - FastAPI Template",
      },
    ],
  }),
})

function RecebimentoVale() {
  const [status, setStatus] = useState<Status>("aberto")
  const [buscaTexto, setBuscaTexto] = useState("")
  const [page, setPage] = useState(0)
  const [orderBy, setOrderBy] = useState<OrderBy>("data_venda")
  const [orderDir, setOrderDir] = useState<OrderDir>("desc")
  const [vendaSelecionada, setVendaSelecionada] = useState<string | null>(
    null,
  )

  const buscaNumero = buscaTexto.trim() === "" ? undefined : Number(buscaTexto)

  function handleStatusChange(novoStatus: Status) {
    setStatus(novoStatus)
    setPage(0)
  }

  function handleSortChange(novoOrderBy: OrderBy, novoOrderDir: OrderDir) {
    setOrderBy(novoOrderBy)
    setOrderDir(novoOrderDir)
    setPage(0)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Recebimento de Vale
        </h1>
        <p className="text-muted-foreground">
          Consulta e baixa das vendas em vale -- separado da venda em si,
          essa tela é só pra controlar o que já foi (ou ainda precisa ser)
          recebido.
        </p>
      </div>

      <ResumoCards onVerPagos={() => handleStatusChange("aguardando_baixa")} />

      <div className="flex items-center gap-3">
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Consulta número do vale..."
            className="pl-8"
            type="number"
            value={buscaTexto}
            onChange={(e) => {
              setBuscaTexto(e.target.value)
              setPage(0)
            }}
          />
        </div>

        {status === "aguardando_baixa" && (
          <button
            type="button"
            className="text-sm text-muted-foreground underline underline-offset-2"
            onClick={() => handleStatusChange("aberto")}
          >
            ← voltar pra "em aberto"
          </button>
        )}
      </div>

      <ValesTable
        status={status}
        buscaNumero={buscaNumero}
        page={page}
        onPageChange={setPage}
        orderBy={orderBy}
        orderDir={orderDir}
        onSortChange={handleSortChange}
        onRowClick={setVendaSelecionada}
      />

      <DetalheValeSheet
        vendaId={vendaSelecionada}
        onOpenChange={(open) => {
          if (!open) setVendaSelecionada(null)
        }}
      />
    </div>
  )
}

export default RecebimentoVale
