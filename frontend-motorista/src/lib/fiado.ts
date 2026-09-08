// [mcp-local harness] feature: fix-fiado-sheet-endereco | plano: c45fa1e1 | 2026-09-08 12:26:01
// Adiciona campo endereco opcional ao tipo FiadoEmAberto
// API helpers para Recebimento de Fiado no app motorista
import { request } from "./api"

export type FiadoEmAberto = {
  id: string
  cliente_id: string
  cliente_nome: string
  motorista_id: string
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
  // Endereço onde a venda foi realizada
  endereco?: {
    rua_nome: string
    numero: string
    bairro_nome: string
    complemento?: string | null
  } | null
  created_at: string
}

export type ClienteBusca = {
  id: string
  nome: string
  cpf: string
  telefone: string | null
}

const DIAS_ATRASO = 30

export function isAtrasado(dataVendaISO: string): boolean {
  const dataVenda = new Date(`${dataVendaISO}T00:00:00`)
  const limite = new Date()
  limite.setHours(0, 0, 0, 0)
  limite.setDate(limite.getDate() - DIAS_ATRASO)
  return dataVenda <= limite
}

export function diasEmAberto(dataVendaISO: string): number {
  const dataVenda = new Date(`${dataVendaISO}T00:00:00`)
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  return Math.floor((hoje.getTime() - dataVenda.getTime()) / (1000 * 60 * 60 * 24))
}

export async function buscarMeusFiados(token: string, motoristaId: string): Promise<FiadoEmAberto[]> {
  const res = await request<{ data: FiadoEmAberto[]; count: number }>(
    `/api/v1/vendas/vales-recebimento?status=todos&limit=100`,
    { token }
  )
  return res.data.filter(v => v.motorista_id === motoristaId)
}

export async function buscarClientesFiado(token: string, q: string): Promise<ClienteBusca[]> {
  const res = await request<{ data: ClienteBusca[]; count: number }>(
    `/api/v1/clientes/?q=${encodeURIComponent(q)}&limit=10`,
    { token }
  )
  return res.data
}

export async function marcarFiadoRecebido(token: string, vendaId: string, valorPago: string): Promise<FiadoEmAberto> {
  return request(`/api/v1/vendas/${vendaId}/marcar-pago`, {
    method: "PATCH",
    token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ valor_pago: valorPago }),
  })
}
