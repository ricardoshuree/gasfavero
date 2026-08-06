// [mcp-local harness] feature: inadimplentes-frontend | plano: b019c5b0 | 2026-08-06 12:53:34
// Rota /inadimplentes -- gate via modulo inadimplencia, default mes vigente, junta menu/card/grafico/tabela
// Pagina /inadimplentes -- gate via modulo "inadimplencia" (ja
// existia cadastrado no banco, nunca usado ate agora). Vendas em
// vale que "estiveram em atraso" em algum momento (nao so quem esta
// em aberto agora), agrupadas por data_pagamento_vale via menu
// Ano/Mes (sem linha de Semana), com filtro de motorista na tabela
// (independente do menu) + exportacao em PDF.
import { createFileRoute, redirect } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import { UsersService, VendasService } from "@/client"
import InadimplentesCard from "@/components/Inadimplentes/InadimplentesCard"
import {
  type InadimplentesSelecao,
  InadimplentesMenu,
} from "@/components/Inadimplentes/InadimplentesMenu"
import InadimplentesTable from "@/components/Inadimplentes/InadimplentesTable"
import LivroVendasChart from "@/components/LivroVendas/LivroVendasChart"

const MODULE = "inadimplencia"

export const Route = createFileRoute("/_layout/inadimplentes")({
  component: Inadimplentes,
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
        title: "Inadimplentes - FastAPI Template",
      },
    ],
  }),
})

function defaultSelecao(): InadimplentesSelecao {
  const hoje = new Date()
  // Mesmo padrão do Livro de Vendas: mês vigente ao carregar a tela.
  return { escopo: "mes", ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 }
}

function Inadimplentes() {
  const [selecao, setSelecao] = useState<InadimplentesSelecao>(
    defaultSelecao(),
  )

  const { data: anosData } = useQuery({
    queryKey: ["inadimplentesAnosDisponiveis"],
    queryFn: () => VendasService.readInadimplentesAnosDisponiveis(),
  })

  const { data: resumo, isLoading: resumoLoading } = useQuery({
    queryKey: [
      "inadimplentesResumo",
      selecao.escopo,
      selecao.ano,
      selecao.mes,
    ],
    queryFn: () =>
      VendasService.readInadimplentesResumo({
        escopo: selecao.escopo,
        ano: selecao.ano,
        mes: selecao.mes,
      }),
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inadimplentes</h1>
        <p className="text-muted-foreground">
          Vendas em vale que estiveram em atraso (mais de 30 dias) em algum
          momento, agrupadas por vencimento.
        </p>
      </div>

      <InadimplentesMenu
        anosDisponiveis={anosData?.anos ?? []}
        selecao={selecao}
        onChange={setSelecao}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex items-start">
          <InadimplentesCard
            qtd={resumo?.qtd ?? 0}
            valor={resumo?.valor ?? 0}
            isLoading={resumoLoading}
          />
        </div>
        <LivroVendasChart
          grafico={resumo?.grafico ?? []}
          periodoInicio={resumo?.periodo_inicio ?? ""}
          periodoFim={resumo?.periodo_fim ?? ""}
          isLoading={resumoLoading}
        />
      </div>

      <InadimplentesTable />
    </div>
  )
}

export default Inadimplentes
