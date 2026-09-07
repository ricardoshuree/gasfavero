// [mcp-local harness] feature: livro-vendas-motorista | plano: 3366d60e | 2026-09-07 12:32:41
// API helpers para o livro de vendas do motorista: busca filtrada por período, editar e cancelar venda
// Funções de API para o Livro de Vendas do motorista
import { request } from "./api"

export type VendaMotorista = {
  id: string
  cliente_nome: string
  motorista_id: string
  forma_pagamento: string
  valor_total: string
  valor_pago: string
  data_venda: string
  pago_em: string | null
  status: string
  cancelada_em: string | null
  cancelada_por_nome: string | null
  qtd_edicoes: number
  logs_edicao?: Array<{
    id: string
    campo: string
    valor_anterior: string
    valor_novo: string
    editado_por_nome: string | null
    editado_em: string
  }>
  itens: Array<{
    produto_title: string
    quantidade: number
    preco_unitario: string
    subtotal: string
  }>
  created_at: string
}

export type PeriodoFiltro = "hoje" | "ontem" | "semana" | "mes"

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function subtractDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function primeiroDiaSemana(): string {
  const hoje = new Date()
  const dow = hoje.getDay() // 0=dom
  const d = new Date(hoje)
  d.setDate(hoje.getDate() - dow)
  return d.toISOString().slice(0, 10)
}

function primeiroDiaMes(): string {
  const hoje = new Date()
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`
}

export function periodoDatas(periodo: PeriodoFiltro): { inicio: string; fim: string } {
  const hoje = hojeISO()
  switch (periodo) {
    case "hoje":   return { inicio: hoje, fim: hoje }
    case "ontem":  return { inicio: subtractDays(1), fim: subtractDays(1) }
    case "semana": return { inicio: primeiroDiaSemana(), fim: hoje }
    case "mes":    return { inicio: primeiroDiaMes(), fim: hoje }
  }
}

export function isHoje(dataVendaISO: string): boolean {
  return dataVendaISO === hojeISO()
}

export async function buscarMinhasVendas(
  token: string,
  dataInicio: string,
  dataFim: string,
  skip = 0,
  limit = 50
): Promise<{ data: VendaMotorista[]; count: number; soma_preco: string; soma_valor_pago: string }> {
  return request(
    `/api/v1/vendas/livro?data_inicio=${dataInicio}&data_fim=${dataFim}&status=todos&skip=${skip}&limit=${limit}`,
    { token }
  )
}

export async function editarVenda(
  token: string,
  vendaId: string,
  dados: { forma_pagamento?: string; valor_pago?: string; data_venda?: string }
): Promise<VendaMotorista> {
  return request(`/api/v1/vendas/${vendaId}/editar`, {
    method: "PATCH",
    token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  })
}

export async function cancelarVenda(
  token: string,
  vendaId: string
): Promise<VendaMotorista> {
  return request(`/api/v1/vendas/${vendaId}/cancelar`, {
    method: "PATCH",
    token,
  })
}
