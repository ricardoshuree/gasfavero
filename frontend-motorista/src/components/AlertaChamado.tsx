// [mcp-local harness] feature: fase3-ajustes-motorista | plano: 396646b8 | 2026-08-08 10:57:29
// Convite direto: so Aceitar (sem Recusar). Chamado aberto: Recusar vira "Dispensar" -- 100% local, sem API
import type { CSSProperties } from "react"
import type { DemandaVendaPublic } from "../lib/demandas"
import { CORES_APP as CORES } from "../theme"

// Alerta de chamada em tela cheia, estilo "novo pedido" de apps de
// entrega/corrida -- dispara quando o polling da tela Chamadas
// detecta um chamado NOVO (ver detecção em MinhasDemandas.tsx).
//
// LIMITAÇÃO CONHECIDA (simulação, não é push de verdade): isso só
// funciona com o app ABERTO em primeiro plano -- é o polling da
// própria tela que detecta a novidade, não uma notificação do
// sistema operacional. Pra alertar o motorista com o app fechado/em
// segundo plano (o objetivo final, "toca um alarme e fica na tela
// até atender"), é necessário Firebase Cloud Messaging (push
// notification nativa) + tela de alarme sobre a lock screen --
// escopo maior, decisão de fazer depois (ver conversa com Ricardo).
//
// REGRA DE NEGÓCIO (decidida com o Ricardo, sessão de mapeamento de
// cenários): convite DIRETO (motorista_id já é este motorista) nunca
// tem opção de recusar -- só "Aceitar". Quem gerencia reatribuição ou
// cancelamento de um convite direto é o ATENDENTE, não o motorista
// recusando por conta própria (isso evita o chamado ficar "preso"
// invisível pra todo mundo). Só chamado ABERTO (motorista_id null)
// tem "Recusar" aqui, e esse botão é 100% LOCAL -- só fecha a tela e
// para o alarme pra ESTE aparelho; não chama a API, não muda nada no
// banco. O chamado continua pendente/aberto normalmente pra qualquer
// outro motorista (e reaparece na aba "Agora" deste motorista sem o
// alarme, já que ele já "viu" essa notificação).

// Verde de sucesso -- contraste forte com o fundo vermelho do
// alerta (hex exato pedido pelo Ricardo).
const VERDE_ACEITAR = "#00A63E"

function formatarEndereco(d: DemandaVendaPublic): string {
  const { rua_nome, numero, complemento, bairro_nome } = d.endereco
  const numeroComplemento = complemento ? `${numero} - ${complemento}` : numero
  return `${rua_nome}, ${numeroComplemento} — ${bairro_nome}`
}

function formatarItens(d: DemandaVendaPublic): string {
  if (d.itens.length === 0) return "(sem itens)"
  return d.itens.map((i) => `${i.quantidade}x ${i.produto_title}`).join(", ")
}

function AlertaChamado({
  demanda,
  processando,
  onAceitar,
  onDispensar,
}: {
  demanda: DemandaVendaPublic
  processando: boolean
  onAceitar: () => void
  /** Fecha o alerta SEM mexer no chamado -- só pra chamados abertos
   * (ver comentário acima). Convite direto não recebe essa prop
   * disponível na prática (botão nem aparece). */
  onDispensar: () => void
}) {
  const aberto = demanda.motorista_id === null

  return (
    <div style={estilos.overlay}>
      <div style={estilos.conteudo}>
        <span style={estilos.eyebrow}>Novo chamado</span>
        <div style={estilos.pulso} />

        <div style={estilos.card}>
          <span style={estilos.cliente}>{demanda.cliente_nome}</span>
          <span style={estilos.endereco}>{formatarEndereco(demanda)}</span>
          <span style={estilos.itens}>{formatarItens(demanda)}</span>
          {demanda.observacao && (
            <span style={estilos.observacao}>{demanda.observacao}</span>
          )}
        </div>

        <button style={estilos.botaoAceitar} disabled={processando} onClick={onAceitar}>
          {processando ? "..." : "Aceitar chamado"}
        </button>

        {aberto && (
          <>
            {/* Espaço generoso antes do Dispensar -- evita toque
                acidental logo depois de "Aceitar chamado" */}
            <div style={estilos.espacador} />
            <button style={estilos.botaoRecusar} disabled={processando} onClick={onDispensar}>
              Recusar
            </button>
          </>
        )}
      </div>
    </div>
  )
}

const estilos: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: CORES.destaque,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding:
      "max(1.5rem, env(safe-area-inset-top)) 1.5rem max(1.5rem, env(safe-area-inset-bottom)) 1.5rem",
    zIndex: 200,
    boxSizing: "border-box",
  },
  conteudo: {
    width: "100%",
    maxWidth: "360px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.75rem",
  },
  eyebrow: {
    color: CORES.destaqueTexto,
    fontWeight: 700,
    fontSize: "1rem",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },
  pulso: {
    width: 16,
    height: 16,
    borderRadius: "50%",
    background: CORES.destaqueTexto,
    opacity: 0.9,
  },
  card: {
    width: "100%",
    background: CORES.fundoCardInterno,
    borderRadius: "0.85rem",
    padding: "1.1rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    margin: "0.5rem 0 1rem",
  },
  cliente: { fontWeight: 700, fontSize: "1.15rem", color: CORES.texto },
  endereco: { fontSize: "0.9rem", color: CORES.textoSecundario },
  itens: { fontSize: "0.85rem", color: CORES.textoSecundario },
  observacao: { fontSize: "0.8rem", fontStyle: "italic", color: CORES.textoSecundario },
  botaoAceitar: {
    width: "100%",
    padding: "0.9rem",
    borderRadius: "0.6rem",
    border: "none",
    background: VERDE_ACEITAR,
    color: "#FFFFFF",
    fontWeight: 700,
    fontSize: "1rem",
  },
  espacador: { height: "1.5rem" },
  botaoRecusar: {
    width: "100%",
    padding: "0.6rem",
    borderRadius: "0.6rem",
    border: `1px solid rgba(255,255,255,0.5)`,
    background: "transparent",
    color: "rgba(255,255,255,0.85)",
    fontWeight: 400,
    fontSize: "0.8rem",
  },
}

export default AlertaChamado
