// [mcp-local harness] feature: inadimplentes-motorista | plano: 458ed6ae | 2026-09-07 13:19:18
// Tipos e helpers para inadimplentes: diasAtraso, corAtraso, labelAtraso, buscarInadimplentes
// API helpers para Inadimplentes no app motorista
import { request } from "./api"

export type InadimplentVenda = {
  id: string
  cliente_id: string
  cliente_nome: string
  motorista_id: string
  motorista_nome: string
  vale_numero: number | null
  valor_total: string
  valor_pago: string
  data_venda: string
  data_pagamento_vale: string | null
  recebido_em: string | null
  recebido_por_nome: string | null
  itens: Array<{
    produto_title: string
    quantidade: number
    subtotal: string
  }>
  endereco: {
    rua_nome: string
    numero: string
    bairro_nome: string
    cidade_nome: string
    complemento?: string | null
  } | null
  created_at: string
}

/** Dias em atraso a partir da data da venda */
export function diasAtraso(dataVendaISO: string): number {
  const dataVenda = new Date(`${dataVendaISO}T00:00:00`)
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  return Math.floor((hoje.getTime() - dataVenda.getTime()) / (1000 * 60 * 60 * 24))
}

/** Cor do badge/texto por criticidade */
export function corAtraso(dias: number): { bg: string; text: string } {
  if (dias >= 50) return { bg: "#fee2e2", text: "#991b1b" }   // vermelho escuro — crítico
  return { bg: "#fef3c7", text: "#92400e" }                    // âmbar — em atraso
}

/** Texto do badge */
export function labelAtraso(dias: number): string {
  return dias >= 50 ? "Crítico" : "Em atraso"
}

/** Busca todos os inadimplentes (pago_em null, > 30 dias) */
export async function buscarInadimplentes(token: string): Promise<InadimplentVenda[]> {
  const res = await request<{ data: InadimplentVenda[]; count: number }>(
    `/api/v1/vendas/inadimplentes?limit=200`,
    { token }
  )
  return res.data
}
