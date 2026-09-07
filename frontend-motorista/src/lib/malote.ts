// [mcp-local harness] feature: fix-malote-tipos-e-tela | plano: 1c62f81b | 2026-09-07 19:44:52
// lib/malote.ts reescrito com tipos corretos baseados na resposta real do backend
// lib/malote.ts — tipos e API do Malote do Motorista
// Estrutura baseada na resposta real de GET /api/v1/fechamento/resumo/{motorista_id}/{data}
import { request } from "./api"

export type VendaMalote = {
  id: string
  cliente_nome: string
  forma_pagamento: string
  valor_pago: number
  data_venda: string
}

export type CascoMalote = {
  id: string
  produto_nome: string
  quantidade: number
  cliente_nome: string
  endereco: string
  emprestado_em: string | null
  recebido_em: string | null
}

export type CascosDodia = {
  emprestados_hoje: CascoMalote[]
  devolvidos_hoje: CascoMalote[]
  total_emprestados_hoje: number
  total_devolvidos_hoje: number
  total_aberto_acumulado: number
  qtd_registros_abertos: number
}

export type ResumoMalote = {
  abertura_id: string
  carga_produtos: Array<{
    produto_id: string
    produto_nome: string
    carregado: number
  }>
  fundo_troco: number
  total_dinheiro: number
  total_pix: number
  total_debito: number
  total_credito: number
  total_fiado: number
  total_esperado: number
  total_geral: number
  ja_fechado: boolean
  vendas: VendaMalote[]
  cascos_do_dia: CascosDodia
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10)
}

export async function buscarResumoMalote(
  token: string,
  motoristaId: string
): Promise<ResumoMalote> {
  const hoje = hojeISO()
  return request<ResumoMalote>(
    `/api/v1/fechamento/resumo/${motoristaId}/${hoje}`,
    { token }
  )
}

const LABEL_FORMA: Record<string, string> = {
  cartao_debito:  "Débito",
  cartao_credito: "Crédito",
  pix:            "Pix",
  dinheiro:       "Dinheiro",
  vale:           "Fiado",
  vale_gas:       "Vale Gás",
  gas_povo:       "Gás do Povo",
}

export function gerarTextoMalote(resumo: ResumoMalote, nomeMotorista: string): string {
  const hoje = new Date().toLocaleDateString("pt-BR")
  const fmt = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`

  const linhasProdutos = resumo.carga_produtos
    .map(p => `  ${p.produto_nome}: ${p.carregado} unid.`)
    .join("\n")

  const linhasVendas = resumo.vendas
    .map(v => `  ${v.cliente_nome} · ${LABEL_FORMA[v.forma_pagamento] ?? v.forma_pagamento} · ${fmt(v.valor_pago)}`)
    .join("\n")

  const linhaCascos = resumo.cascos_do_dia.total_aberto_acumulado > 0
    ? `\n⚠️ Cascos em aberto acumulado: ${resumo.cascos_do_dia.total_aberto_acumulado}`
    : ""

  return [
    `🧾 *Malote do dia — ${nomeMotorista}*`,
    `📅 ${hoje}`,
    "",
    `*Total a entregar: ${fmt(resumo.total_geral)}*`,
    `(${resumo.vendas.length} vendas)`,
    "",
    "💵 *Dinheiro a entregar:*",
    `  Espécie: ${fmt(resumo.total_dinheiro)}`,
    `  Pix: ${fmt(resumo.total_pix)}`,
    `  Débito (maquininha): ${fmt(resumo.total_debito)}`,
    `  Crédito (maquininha): ${fmt(resumo.total_credito)}`,
    `  Fiado: ${fmt(resumo.total_fiado)}`,
    "",
    "🛢 *Produtos (carga):*",
    linhasProdutos || "  Sem carga registrada",
    "",
    "📋 *Vendas do dia:*",
    linhasVendas || "  Nenhuma venda",
    linhaCascos,
  ].filter(l => l !== undefined).join("\n")
}
