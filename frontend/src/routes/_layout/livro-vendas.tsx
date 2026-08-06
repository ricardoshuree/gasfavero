// [mcp-local harness] feature: livro-vendas-frontend-route | plano: 0620b8c5 | 2026-08-06 09:37:46
// Rota /livro-vendas -- gate via modulo livro_vendas, estado default mes vigente, orquestra menu/cards/grafico/tabela
// Pagina /livro-vendas -- gate via modulo "livro_vendas" (proprio,
// nao reaproveita "vendas"). Dashboard geral de TODAS as vendas
// (qualquer forma de pagamento) com menu interativo Ano/Mes/Semana
// que dirige o grafico + os 2 cards, e uma tabela paginada
// independente do menu com filtro proprio de data.
import { createFileRoute, redirect } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import { UsersService, VendasService } from "@/client"
import LivroVendasCards from "@/components/LivroVendas/LivroVendasCards"
import LivroVendasChart from "@/components/LivroVendas/LivroVendasChart"
import {
  type LivroSelecao,
  LivroVendasMenu,
} from "@/components/LivroVendas/LivroVendasMenu"
import LivroVendasTable from "@/components/LivroVendas/LivroVendasTable"

const MODULE = "livro_vendas"

export const Route = createFileRoute("/_layout/livro-vendas")({
  component: LivroVendas,
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
        title: "Livro de Vendas - FastAPI Template",
      },
    ],
  }),
})

function defaultSelecao(): LivroSelecao {
  const hoje = new Date()
  // Estado padrão ao carregar a tela: mês vigente (decisão
  // confirmada com o Ricardo).
  return { escopo: "mes", ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 }
}

function LivroVendas() {
  const [selecao, setSelecao] = useState<LivroSelecao>(defaultSelecao())

  const { data: anosData } = useQuery({
    queryKey: ["livroAnosDisponiveis"],
    queryFn: () => VendasService.readLivroAnosDisponiveis(),
  })

  const { data: resumo, isLoading: resumoLoading } = useQuery({
    queryKey: ["livroResumo", selecao.escopo, selecao.ano, selecao.mes],
    queryFn: () =>
      VendasService.readLivroResumo({
        escopo: selecao.escopo,
        ano: selecao.ano,
        mes: selecao.mes,
      }),
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Livro de Vendas</h1>
        <p className="text-muted-foreground">
          Visão geral de todas as vendas -- qualquer forma de pagamento -- com
          filtro por período e histórico completo abaixo.
        </p>
      </div>

      <LivroVendasMenu
        anosDisponiveis={anosData?.anos ?? []}
        selecao={selecao}
        onChange={setSelecao}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <LivroVendasCards
          emCaixaQtd={resumo?.em_caixa_qtd ?? 0}
          emCaixaValor={resumo?.em_caixa_valor ?? 0}
          emAbertoQtd={resumo?.em_aberto_qtd ?? 0}
          emAbertoValor={resumo?.em_aberto_valor ?? 0}
          isLoading={resumoLoading}
        />
        <LivroVendasChart
          grafico={resumo?.grafico ?? []}
          periodoInicio={resumo?.periodo_inicio ?? ""}
          periodoFim={resumo?.periodo_fim ?? ""}
          isLoading={resumoLoading}
        />
      </div>

      <LivroVendasTable />
    </div>
  )
}

export default LivroVendas
