// [mcp-local harness] feature: frontend-motorista-ajustes-usabilidade | plano: 00bcba9d | 2026-08-07 20:01:24
// Ordem FIFO (mais antigo primeiro) dentro de cada grupo de prioridade na aba Agora
import { request } from "./api"

// Espelha o schema de DemandaVendaPublic do backend
// (backend/app/models.py). Só os campos que a tela do motorista usa.
type EnderecoPublic = {
  id: string
  numero: string
  complemento: string | null
  rua_nome: string
  bairro_nome: string
  cidade_nome: string
  latitude: number | null
  longitude: number | null
}

type DemandaVendaItemPublic = {
  id: string
  produto_id: string
  produto_title: string
  quantidade: number
}

type DemandaStatus = "pendente" | "aceita" | "recusada" | "concluida"

type DemandaVendaPublic = {
  id: string
  cliente_id: string
  cliente_nome: string
  endereco: EnderecoPublic
  motorista_id: string | null
  motorista_nome: string | null
  observacao: string | null
  status: DemandaStatus
  criado_por_id: string
  created_at: string
  respondida_em: string | null
  finalizada_em: string | null
  itens: DemandaVendaItemPublic[]
}

async function listarDemandas(token: string): Promise<DemandaVendaPublic[]> {
  const res = await request<{ data: DemandaVendaPublic[] }>("/api/v1/demandas-venda/", {
    token,
  })
  return res.data
}

async function aceitarDemanda(
  token: string,
  demandaId: string,
  motoristaId: string,
): Promise<DemandaVendaPublic> {
  return request<DemandaVendaPublic>(`/api/v1/demandas-venda/${demandaId}/aceitar`, {
    method: "PATCH",
    token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ motorista_id: motoristaId }),
  })
}

async function recusarDemanda(token: string, demandaId: string): Promise<DemandaVendaPublic> {
  return request<DemandaVendaPublic>(`/api/v1/demandas-venda/${demandaId}/recusar`, {
    method: "PATCH",
    token,
  })
}

async function concluirDemanda(token: string, demandaId: string): Promise<DemandaVendaPublic> {
  return request<DemandaVendaPublic>(`/api/v1/demandas-venda/${demandaId}/concluir`, {
    method: "PATCH",
    token,
  })
}

function ehHoje(isoDate: string): boolean {
  const d = new Date(isoDate)
  const hoje = new Date()
  return (
    d.getFullYear() === hoje.getFullYear() &&
    d.getMonth() === hoje.getMonth() &&
    d.getDate() === hoje.getDate()
  )
}

// Separa os chamados nas duas sub-abas da tela "Chamadas":
//
// "agora" -- precisa de ação ou está em andamento: chamados ABERTOS
// (motorista_id null, pendentes -- qualquer um pode aceitar),
// CONVITES diretos pra mim (motorista_id === meuId, pendente), e os
// que já ACEITEI e ainda não cheguei (motorista_id === meuId,
// aceita). Ordenados com aberto primeiro (pedido do Ricardo), depois
// convite, depois aceito -- dentro de cada grupo, o MAIS ANTIGO
// primeiro (FIFO -- fila de atendimento por ordem de chegada, evita
// "esquecer" um chamado antigo. Otimização por melhor trajeto fica
// fora de escopo por enquanto -- exigiria integrar rota real, ex:
// Google Directions API).
//
// "atendidas" -- só os que EU concluí hoje (finalizada_em dentro do
// dia corrente, mesmo espírito do filtro "Chamadas hoje" do painel
// do Mapa no frontend principal -- aqui simplificado pra data local
// do aparelho em vez de fuso Brasília explícito, adequado o
// suficiente pro uso em campo).
function separarChamadas(
  demandas: DemandaVendaPublic[],
  meuId: string,
): { agora: DemandaVendaPublic[]; atendidas: DemandaVendaPublic[] } {
  const prioridade = (d: DemandaVendaPublic): number => {
    if (d.motorista_id === null) return 0 // aberto
    if (d.status === "pendente") return 1 // convite direto
    return 2 // aceito, aguardando chegada
  }

  const agora = demandas
    .filter((d) => {
      if (d.motorista_id === null) return d.status === "pendente"
      if (d.motorista_id === meuId) return d.status === "pendente" || d.status === "aceita"
      return false
    })
    .sort((a, b) => {
      const p = prioridade(a) - prioridade(b)
      if (p !== 0) return p
      // Mais antigo primeiro (FIFO) dentro do mesmo grupo
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })

  const atendidas = demandas
    .filter(
      (d) =>
        d.motorista_id === meuId &&
        d.status === "concluida" &&
        d.finalizada_em !== null &&
        ehHoje(d.finalizada_em),
    )
    .sort((a, b) => {
      const a_ts = a.finalizada_em ? new Date(a.finalizada_em).getTime() : 0
      const b_ts = b.finalizada_em ? new Date(b.finalizada_em).getTime() : 0
      return b_ts - a_ts
    })

  return { agora, atendidas }
}

export {
  listarDemandas,
  aceitarDemanda,
  recusarDemanda,
  concluirDemanda,
  separarChamadas,
}
export type { DemandaVendaPublic, DemandaVendaItemPublic, EnderecoPublic, DemandaStatus }
