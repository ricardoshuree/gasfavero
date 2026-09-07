// [mcp-local harness] feature: malote-motorista-fix | plano: c756f0d7 | 2026-09-07 13:44:23
// Remove const vendido nao utilizado na funcao gerarTextoMalote
// API helpers para o Malote do motorista
import { request } from "./api"

export type ResumoMalote = {
  fundo_troco: number
  carga_produtos: Array<{
    produto_id: string
    produto_nome: string
    carregado: number
  }>
  total_dinheiro: number
  total_pix: number
  total_debito: number
  total_credito: number
  total_fiado_recebido: number
  total_geral: number
  qtd_vendas: number
  fiados_recebidos: Array<{
    id: string
    cliente_nome: string
    vale_numero: number | null
    itens: Array<{ produto_title: string; quantidade: number }>
    valor_pago: string
    recebido_em: string
  }>
  fiados_em_aberto: Array<{
    id: string
    cliente_nome: string
    vale_numero: number | null
    valor_total: string
    data_venda: string
  }>
  vale_gas_aberto: Array<{
    id: string
    cliente_nome: string
    valor_total: string
  }>
  gas_povo_aberto: Array<{
    id: string
    cliente_nome: string
    valor_total: string
  }>
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10)
}

export async function buscarResumoMalote(
  token: string,
  motoristaId: string
): Promise<ResumoMalote> {
  const hoje = hojeISO()
  return request(`/api/v1/fechamento/resumo/${motoristaId}/${hoje}`, { token })
}

export function gerarTextoMalote(resumo: ResumoMalote, nomeMotorista: string): string {
  const hoje = new Date().toLocaleDateString("pt-BR")
  const fmt = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`

  const linhasProdutos = resumo.carga_produtos
    .map(p => `  ${p.produto_nome}: saiu ${p.carregado}`)
    .join("\n")

  const pendFiado = resumo.fiados_em_aberto.length > 0
    ? `\n⏳ Fiados em aberto: ${resumo.fiados_em_aberto.length} (${fmt(resumo.fiados_em_aberto.reduce((a, f) => a + Number(f.valor_total), 0))})`
    : ""
  const pendValeGas = resumo.vale_gas_aberto.length > 0
    ? `\n⏳ Vale Gás: ${resumo.vale_gas_aberto.length} venda(s)`
    : ""
  const pendGasPovo = resumo.gas_povo_aberto.length > 0
    ? `\n⏳ Gás do Povo: ${resumo.gas_povo_aberto.length} venda(s) (governo paga depois)`
    : ""

  return [
    `🧾 *Malote do dia — ${nomeMotorista}*`,
    `📅 ${hoje}`,
    "",
    `*Total a entregar: ${fmt(resumo.total_geral)}*`,
    `(${resumo.qtd_vendas} vendas)`,
    "",
    "💵 *Dinheiro a entregar:*",
    `  Espécie: ${fmt(resumo.total_dinheiro)}`,
    `  Pix: ${fmt(resumo.total_pix)}`,
    `  Débito (maquininha): ${fmt(resumo.total_debito)}`,
    `  Crédito (maquininha): ${fmt(resumo.total_credito)}`,
    `  Fiados recebidos hoje: ${fmt(resumo.total_fiado_recebido)}`,
    "",
    "🛢 *Produtos (carga):*",
    linhasProdutos || "  Sem carga registrada",
    pendFiado + pendValeGas + pendGasPovo,
  ].join("\n")
}
