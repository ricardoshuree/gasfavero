// [mcp-local harness] feature: devolucao-cascos-motorista | plano: 54267dc7 | 2026-09-07 18:26:55
// Lib de cascos — tipos CascoLog, Casco, CascosResponse; buscarCascosEmAberto, registrarRecebimentoCasco; helpers labelStatus, corStatus, labelDias
// Lib de cascos — app motorista
// Tipos e chamadas de API para empréstimos e devoluções de botijões
import { request } from "./api"

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface CascoLog {
  id: string
  evento: string
  usuario_nome: string | null
  observacao: string | null
  created_at: string
}

export interface Casco {
  id: string
  venda_id: string
  produto_id: string
  produto_nome: string
  quantidade: number
  motorista_id: string | null
  motorista_nome: string | null
  cliente_id: string
  cliente_nome: string
  recebido_em: string | null
  recebido_por_nome: string | null
  confirmado_em: string | null
  confirmado_por_nome: string | null
  dias_em_aberto: number
  // "emprestado" | "recebido_aguardando" | "devolvido"
  status: string
  logs: CascoLog[]
  created_at: string
}

export interface CascosResponse {
  data: Casco[]
  count: number
  total_cascos_abertos: number
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/** Lista cascos em aberto (sem confirmação). Se motorista_id informado, filtra. */
export async function buscarCascosEmAberto(
  token: string,
  motorista_id?: string,
): Promise<CascosResponse> {
  const qs = motorista_id ? `?motorista_id=${motorista_id}` : ""
  return request<CascosResponse>(`/api/v1/cascos/em-aberto${qs}`, { token })
}

/** Motorista registra recebimento físico do botijão (step 1 da dupla checagem). */
export async function registrarRecebimentoCasco(
  token: string,
  casco_id: string,
  observacao?: string,
): Promise<Casco> {
  return request<Casco>(`/api/v1/cascos/${casco_id}/receber`, {
    method: "PATCH",
    token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ observacao: observacao ?? null }),
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function labelStatus(status: string): string {
  if (status === "emprestado") return "Emprestado"
  if (status === "recebido_aguardando") return "Recebido — aguarda gerente"
  if (status === "devolvido") return "Devolvido"
  return status
}

export function corStatus(status: string): { bg: string; text: string } {
  if (status === "emprestado") return { bg: "#fef3c7", text: "#92400e" }
  if (status === "recebido_aguardando") return { bg: "#dbeafe", text: "#1e40af" }
  return { bg: "#f0f4eb", text: "#3a5c1a" }
}

export function labelDias(dias: number): string {
  if (dias === 0) return "Hoje"
  if (dias === 1) return "1 dia"
  return `${dias} dias`
}
