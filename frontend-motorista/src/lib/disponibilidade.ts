// [mcp-local harness] feature: fase4-motorista-disponibilidade-cancelamento | plano: ab68610c | 2026-08-08 11:43:30
// API de disponibilidade -- busca estado atual + atualiza (PUT real, persistido no backend)
import { request } from "./api"

type MotoristaDisponibilidadePublic = {
  motorista_id: string
  motorista_nome: string
  disponivel: boolean
}

/** Busca a disponibilidade atual de UM motorista (lê a lista inteira
 * e filtra -- não existe endpoint singular ainda, e a lista hoje é
 * pequena o suficiente pra isso não pesar). */
async function buscarMinhaDisponibilidade(
  token: string,
  motoristaId: string,
): Promise<boolean | null> {
  const res = await request<{ data: MotoristaDisponibilidadePublic[] }>(
    "/api/v1/motoristas/disponibilidade",
    { token },
  )
  const meu = res.data.find((m) => m.motorista_id === motoristaId)
  return meu ? meu.disponivel : null
}

async function atualizarDisponibilidade(
  token: string,
  motoristaId: string,
  disponivel: boolean,
): Promise<void> {
  await request(`/api/v1/motoristas/${motoristaId}/disponibilidade`, {
    method: "PUT",
    token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ disponivel }),
  })
}

export { buscarMinhaDisponibilidade, atualizarDisponibilidade }
