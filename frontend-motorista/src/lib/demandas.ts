// [mcp-local harness] feature: fifo-em-atendimento | plano: 24929ea8 | 2026-08-08 13:55:37
// Grupo "Em atendimento" agora ordena FIFO por respondida_em (mais antigo primeiro); grupos aberto/convite continuam mais novo primeiro
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

// "recusada" pode existir em registros antigos (fluxo legado, não
// produzido mais por nenhuma ação do app do motorista -- ver
// comentário em models.py), mas o app não trata ativamente esse
// status em lugar nenhum.
type DemandaStatus = "pendente" | "aceita" | "recusada" | "cancelada" | "concluida"

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

// Grupos de prioridade dentro da aba "Agora" -- 0/1 (aguardando
// ação) sobem pro topo antes de 2 (já em atendimento).
const PRIORIDADE_ABERTO = 0
const PRIORIDADE_CONVITE = 1
const PRIORIDADE_EM_ATENDIMENTO = 2

// Separa os chamados nas duas sub-abas da tela "Chamadas":
//
// "agora" -- precisa de ação ou está em andamento: chamados ABERTOS
// (motorista_id null, pendentes -- qualquer um pode aceitar),
// CONVITES diretos pra mim (motorista_id === meuId, pendente), e os
// que já ACEITEI e ainda não cheguei (motorista_id === meuId,
// aceita). Grupos em ordem fixa: aberto > convite > em atendimento.
//
// DENTRO de cada grupo, a ordem de desempate é DIFERENTE por
// natureza do grupo (pedido do Ricardo, sessão de testes reais):
//   - aberto / convite (aguardando ação): MAIS NOVO primeiro -- é um
//     alerta, precisa ficar em destaque assim que chega, não
//     enterrado embaixo de chamado antigo esquecido.
//   - em atendimento (já aceito): MAIS ANTIGO primeiro (FIFO) --
//     aqui não é mais "alerta", é fila de atendimento de verdade
//     (analogia do Ricardo: "fila de balcão" -- cliente já está
//     esperando desde que o motorista aceitou, quem aceitou primeiro
//     deveria ser atendido primeiro). Usa respondida_em (quando
//     aceitou) como critério, não created_at (quando o chamado foi
//     despachado) -- é o mesmo timestamp já exibido no chip de tempo
//     do card ("Em atendimento", ver MinhasDemandas.tsx).
//
// Chamados CANCELADOS não entram aqui -- ver tratamento especial em
// MinhasDemandas.tsx (o card "lingera" por até 15s com aviso, fora
// deste filtro puro).
//
// "atendidas" -- só os que EU encerrei hoje, seja por CONCLUIR
// (chegou de verdade) ou por CANCELAMENTO do atendente
// (finalizada_em dentro do dia corrente, mesmo espírito do filtro
// "Chamadas hoje" do painel do Mapa no frontend principal -- aqui
// simplificado pra data local do aparelho em vez de fuso Brasília
// explícito, adequado o suficiente pro uso em campo). O frontend
// precisa olhar `status` pra diferenciar visualmente os dois casos
// (ver CardAtendida em MinhasDemandas.tsx).
function separarChamadas(
  demandas: DemandaVendaPublic[],
  meuId: string,
): { agora: DemandaVendaPublic[]; atendidas: DemandaVendaPublic[] } {
  const prioridade = (d: DemandaVendaPublic): number => {
    if (d.motorista_id === null) return PRIORIDADE_ABERTO
    if (d.status === "pendente") return PRIORIDADE_CONVITE
    return PRIORIDADE_EM_ATENDIMENTO
  }

  const agora = demandas
    .filter((d) => {
      if (d.motorista_id === null) return d.status === "pendente"
      if (d.motorista_id === meuId) return d.status === "pendente" || d.status === "aceita"
      return false
    })
    .sort((a, b) => {
      const pA = prioridade(a)
      const pB = prioridade(b)
      if (pA !== pB) return pA - pB

      if (pA === PRIORIDADE_EM_ATENDIMENTO) {
        // FIFO -- mais antigo aceito primeiro (fila de balcão)
        const aTs = new Date(a.respondida_em ?? a.created_at).getTime()
        const bTs = new Date(b.respondida_em ?? b.created_at).getTime()
        return aTs - bTs
      }
      // Aberto/convite -- mais novo primeiro (alerta em destaque)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

  const atendidas = demandas
    .filter(
      (d) =>
        d.motorista_id === meuId &&
        (d.status === "concluida" || d.status === "cancelada") &&
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

export { listarDemandas, aceitarDemanda, concluirDemanda, separarChamadas }
export type { DemandaVendaPublic, DemandaVendaItemPublic, EnderecoPublic, DemandaStatus }
