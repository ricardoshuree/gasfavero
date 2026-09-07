// [mcp-local harness] feature: vendas-motorista | plano: d865e550 | 2026-09-07 12:12:23
// Tipos e funções de API para vendas no app motorista
// Funções de API para o módulo de vendas do app motorista
import { request } from "./api"

// ── Tipos ──────────────────────────────────────────────────────────────────

export type Produto = {
  id: string
  title: string
  description: string | null
  preco_atual: string | null
}

export type Cliente = {
  id: string
  nome: string
  cpf: string
  telefone: string | null
  endereco?: {
    id: string
    rua_nome: string
    numero: string
    bairro_nome: string
    cidade_nome: string
    complemento?: string | null
  } | null
}

export type Bairro = {
  id: string
  nome: string
}

export type ItemSacola = {
  produtoId: string
  titulo: string
  precoUnitario: string
  quantidade: number
}

export type FormaPagamento =
  | "cartao_debito"
  | "cartao_credito"
  | "pix"
  | "dinheiro"
  | "vale"
  | "vale_gas"
  | "gas_povo"

export type DadosPagamento = {
  forma: FormaPagamento
  // Fiado
  valeNumero?: string
  // Vale Gás
  valeGasNumero?: string
  valeGasBlocoId?: string
  // Gás do Povo
  gasPovoValorGov?: string
  gasPovoFrete?: string
  // Genérico
  valorPago?: string
}

// ── API calls ──────────────────────────────────────────────────────────────

export async function buscarProdutos(token: string): Promise<Produto[]> {
  const res = await request<{ data: Produto[] }>("/api/v1/precos/", { token })
  return res.data
}

export async function buscarClientes(token: string, q: string): Promise<Cliente[]> {
  const res = await request<{ data: Cliente[]; count: number }>(
    `/api/v1/clientes/?q=${encodeURIComponent(q)}&limit=10`,
    { token }
  )
  return res.data
}

export async function buscarBairros(token: string): Promise<Bairro[]> {
  const res = await request<{ data: Bairro[] }>("/api/v1/bairros/", { token })
  return res.data
}

export async function cadastrarCliente(
  token: string,
  dados: {
    nome: string
    cpf: string
    telefone?: string
    endereco?: {
      bairro_id: string
      rua_nome: string
      numero: string
      complemento?: string
    }
  }
): Promise<Cliente> {
  return request<Cliente>("/api/v1/clientes/", {
    method: "POST",
    token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  })
}

export async function validarValeGas(
  token: string,
  numero: string
): Promise<{ valido: boolean; bloco_id: string | null; estabelecimento_nome: string | null }> {
  return request(`/api/v1/vale-gas/validar-numero/${numero}`, { token })
}

export async function criarVenda(
  token: string,
  dados: {
    cliente_id: string
    endereco_id?: string
    motorista_id: string
    forma_pagamento: FormaPagamento
    vale_numero?: number
    vale_gas_numero?: number
    vale_gas_bloco_id?: string
    gas_povo_frete?: string
    valor_pago: string
    data_venda: string
    itens: { produto_id: string; quantidade: number }[]
  }
) {
  return request("/api/v1/vendas/", {
    method: "POST",
    token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  })
}
