// [mcp-local harness] feature: casco-venda-mobile | plano: 6533aabd | 2026-09-13 09:19:10
// Adiciona vende_casco e preco_casco_atual em Produto, comCasco em ItemSacola, CascoEmprestimo, pagamentos[] e data_pagamento_vale em criarVenda
// Tipos e funções de API para vendas no app motorista
import { request } from "./api"

// ── Tipos ──────────────────────────────────────────────────────────────────

export type Produto = {
  id: string
  title: string
  description: string | null
  preco_atual: string | null
  vende_casco: boolean       // se true, exibe toggle "Incluir casco" na sacola
  preco_casco_atual: string | null  // preço do casco quando vende_casco=true
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
  // Casco comprado junto (adiciona ao total da venda)
  vendeCasco: boolean               // se o produto permite casco
  precoCascoAtual: string | null    // preço unitário do casco
  comCasco: boolean                 // toggle: cliente está comprando o casco?
}

export type CascoEmprestimo = {
  produto_id: string
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
  dataPagamentoVale?: string
  // Vale Gás
  valeGasNumero?: string
  valeGasBlocoId?: string
  // Gás do Povo
  gasPovoValorGov?: string
  gasPovoFrete?: string
  // Genérico
  valorPago?: string
  // Mix de pagamento: quando mais de uma forma (sem vale_gas/gas_povo)
  pagamentos?: Array<{
    forma_pagamento: string
    valor: number
    vale_numero?: number
    data_pagamento_vale?: string
  }>
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

export async function criarVenda(
  token: string,
  dados: {
    cliente_id: string
    endereco_id?: string
    motorista_id: string
    forma_pagamento: FormaPagamento
    // Mix de pagamento (quando mais de uma forma sem vale_gas/gas_povo)
    pagamentos?: Array<{
      forma_pagamento: string
      valor: number
      vale_numero?: number
      data_pagamento_vale?: string
    }>
    vale_numero?: number
    data_pagamento_vale?: string
    vale_gas_numero?: number
    vale_gas_bloco_id?: string
    gas_povo_frete?: string
    valor_pago: string
    data_venda: string
    // Itens: com_casco=true quando o cliente COMPROU o casco
    itens: { produto_id: string; quantidade: number; com_casco?: boolean }[]
    // Cascos emprestados (não comprados — sem custo na venda)
    cascos?: CascoEmprestimo[]
  }
) {
  return request("/api/v1/vendas/", {
    method: "POST",
    token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  })
}
