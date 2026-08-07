// [mcp-local harness] feature: frontend-motorista-ajustes-usabilidade | plano: 00bcba9d | 2026-08-07 20:02:23
// Cheguei: flash verde de confirmacao (0.5s) + navegacao pra Vendas nao espera mais o recarregamento da lista (roda em paralelo, em segundo plano)
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react"
import { iniciarAlarme, pararAlarme } from "../lib/alarme"
import {
  aceitarDemanda,
  concluirDemanda,
  type DemandaVendaPublic,
  listarDemandas,
  recusarDemanda,
  separarChamadas,
} from "../lib/demandas"
import { CORES_APP as CORES } from "../theme"
import AlertaChamado from "./AlertaChamado"
import ConfirmDialog from "./ConfirmDialog"

// Ping de atualização da fila -- mesmo espírito do polling de 12s
// usado no Mapa do atendente (ver MapaMotoristas.tsx do frontend
// principal), aqui um pouco mais espaçado (15s) porque não há
// elemento visual (mapa) exigindo atualização fluida, só a lista.
const INTERVALO_POLLING_MS = 15_000

type SubAba = "agora" | "atendidas"

function formatarEndereco(d: DemandaVendaPublic): string {
  const { rua_nome, numero, complemento, bairro_nome } = d.endereco
  const numeroComplemento = complemento ? `${numero} - ${complemento}` : numero
  return `${rua_nome}, ${numeroComplemento} — ${bairro_nome}`
}

function formatarItens(d: DemandaVendaPublic): string {
  if (d.itens.length === 0) return "(sem itens)"
  return d.itens.map((i) => `${i.quantidade}x ${i.produto_title}`).join(", ")
}

/** "8 min" / "1h20" desde um timestamp ISO -- estilo "Despachado há
 * 8min" do iFood. */
function formatarTempoDecorrido(isoDate: string): string {
  const minutos = Math.max(
    0,
    Math.floor((Date.now() - new Date(isoDate).getTime()) / 60_000),
  )
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return resto === 0 ? `${horas}h` : `${horas}h${resto}`
}

/** Chamados que "precisam de ação" -- abertos (qualquer um aceita)
 * ou convites diretos pendentes pra mim. É essa lista que alimenta a
 * detecção de "chamado novo" pro alarme (ver useEffect abaixo). */
function idsPrecisandoAcao(agora: DemandaVendaPublic[], meuId: string): Set<string> {
  return new Set(
    agora
      .filter((d) => d.motorista_id === null || (d.motorista_id === meuId && d.status === "pendente"))
      .map((d) => d.id),
  )
}

// Pequena pausa depois de "Cheguei" -- só o suficiente pro flash
// verde de confirmação ser percebido antes de navegar pra Vendas.
// NÃO espera o recarregamento da lista (esse roda em paralelo, em
// segundo plano) -- é isso que antes travava a navegação por vários
// segundos.
const PAUSA_CONFIRMACAO_MS = 500

function MinhasDemandas({
  token,
  meuId,
  aoConcluirChamado,
}: {
  token: string
  meuId: string
  /** Chamado no App.tsx pra navegar pra aba Vendas depois de "Cheguei" */
  aoConcluirChamado?: () => void
}) {
  const [subAba, setSubAba] = useState<SubAba>("agora")
  const [agora, setAgora] = useState<DemandaVendaPublic[]>([])
  const [atendidas, setAtendidas] = useState<DemandaVendaPublic[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [processando, setProcessando] = useState<string | null>(null)
  const [confirmandoChegadaId, setConfirmandoChegadaId] = useState<string | null>(null)
  const [confirmadoId, setConfirmadoId] = useState<string | null>(null)
  const [alertaChamado, setAlertaChamado] = useState<DemandaVendaPublic | null>(null)

  const idsVistosRef = useRef<Set<string> | null>(null)
  const alarmeIntervalRef = useRef<number | null>(null)

  const pararAlarmeSonoro = useCallback(() => {
    if (alarmeIntervalRef.current !== null) {
      pararAlarme(alarmeIntervalRef.current)
      alarmeIntervalRef.current = null
    }
  }, [])

  const carregar = useCallback(async () => {
    try {
      const todas = await listarDemandas(token)
      const separadas = separarChamadas(todas, meuId)
      setAgora(separadas.agora)
      setAtendidas(separadas.atendidas)
      setErro(null)

      // Detecção de "chamado novo" -- compara com a leitura
      // anterior. Na primeira carga só registra o estado atual (sem
      // disparar alarme pro que já existia antes de abrir o app).
      const idsAtuais = idsPrecisandoAcao(separadas.agora, meuId)
      if (idsVistosRef.current !== null) {
        const novos = [...idsAtuais].filter((id) => !idsVistosRef.current!.has(id))
        if (novos.length > 0 && alarmeIntervalRef.current === null) {
          const chamadoNovo = separadas.agora.find((d) => d.id === novos[0])
          if (chamadoNovo) {
            setAlertaChamado(chamadoNovo)
            alarmeIntervalRef.current = iniciarAlarme()
          }
        }
      }
      idsVistosRef.current = idsAtuais
    } catch {
      setErro("Não foi possível carregar os chamados.")
    } finally {
      setCarregando(false)
    }
  }, [token, meuId])

  useEffect(() => {
    carregar()
    const intervalo = setInterval(carregar, INTERVALO_POLLING_MS)
    return () => {
      clearInterval(intervalo)
      pararAlarmeSonoro()
    }
  }, [carregar, pararAlarmeSonoro])

  async function handleAceitar(id: string) {
    setProcessando(id)
    try {
      await aceitarDemanda(token, id, meuId)
      await carregar()
    } catch {
      setErro("Não foi possível aceitar o chamado. Tente de novo.")
    } finally {
      setProcessando(null)
    }
  }

  async function handleRecusar(id: string) {
    setProcessando(id)
    try {
      await recusarDemanda(token, id)
      await carregar()
    } catch {
      setErro("Não foi possível recusar o chamado. Tente de novo.")
    } finally {
      setProcessando(null)
    }
  }

  async function handleConcluir(id: string) {
    setProcessando(id)
    try {
      await concluirDemanda(token, id)
      setProcessando(null)
      setConfirmadoId(id)
      // Recarrega a lista em segundo plano -- NÃO espera isso antes
      // de navegar (era esse await que travava a tela por vários
      // segundos em rede mais lenta/emulador).
      carregar()
      window.setTimeout(() => {
        setConfirmadoId(null)
        aoConcluirChamado?.()
      }, PAUSA_CONFIRMACAO_MS)
    } catch {
      setErro("Não foi possível concluir o chamado. Tente de novo.")
      setProcessando(null)
    }
  }

  async function handleAceitarDoAlerta() {
    if (!alertaChamado) return
    const id = alertaChamado.id
    pararAlarmeSonoro()
    setAlertaChamado(null)
    await handleAceitar(id)
  }

  async function handleRecusarDoAlerta() {
    if (!alertaChamado) return
    const id = alertaChamado.id
    pararAlarmeSonoro()
    setAlertaChamado(null)
    await handleRecusar(id)
  }

  const listaAtiva = subAba === "agora" ? agora : atendidas
  const chamadoConfirmando = agora.find((d) => d.id === confirmandoChegadaId) ?? null

  return (
    <div style={estilos.pagina}>
      <h1 style={estilos.titulo}>Chamadas</h1>

      <div style={estilos.subAbas}>
        <button style={estiloSubAba(subAba === "agora")} onClick={() => setSubAba("agora")}>
          Agora{agora.length > 0 ? ` (${agora.length})` : ""}
        </button>
        <button
          style={estiloSubAba(subAba === "atendidas")}
          onClick={() => setSubAba("atendidas")}
        >
          Atendidas{atendidas.length > 0 ? ` (${atendidas.length})` : ""}
        </button>
      </div>

      {erro && <p style={estilos.erro}>{erro}</p>}

      {carregando && listaAtiva.length === 0 && <p style={estilos.mensagem}>Carregando...</p>}

      {!carregando && listaAtiva.length === 0 && !erro && (
        <p style={estilos.mensagem}>
          {subAba === "agora" ? "Nenhum chamado no momento." : "Nenhum chamado atendido hoje."}
        </p>
      )}

      <div style={estilos.lista}>
        {subAba === "agora"
          ? agora.map((d) => (
              <CardAgora
                key={d.id}
                demanda={d}
                meuId={meuId}
                processando={processando === d.id}
                confirmado={confirmadoId === d.id}
                onAceitar={() => handleAceitar(d.id)}
                onRecusar={() => handleRecusar(d.id)}
                onPedirConfirmacaoChegada={() => setConfirmandoChegadaId(d.id)}
              />
            ))
          : atendidas.map((d) => <CardAtendida key={d.id} demanda={d} />)}
      </div>

      <ConfirmDialog
        aberto={chamadoConfirmando !== null}
        titulo="Confirmar chegada"
        mensagem={
          chamadoConfirmando
            ? `Confirmar chegada em ${chamadoConfirmando.cliente_nome} (${formatarEndereco(chamadoConfirmando)})? Isso encerra o chamado e abre a tela de Vendas.`
            : ""
        }
        textoConfirmar="Cheguei"
        textoCancelar="Cancelar"
        onConfirmar={() => {
          if (confirmandoChegadaId) handleConcluir(confirmandoChegadaId)
          setConfirmandoChegadaId(null)
        }}
        onCancelar={() => setConfirmandoChegadaId(null)}
      />

      {alertaChamado && (
        <AlertaChamado
          demanda={alertaChamado}
          processando={processando === alertaChamado.id}
          onAceitar={handleAceitarDoAlerta}
          onRecusar={handleRecusarDoAlerta}
        />
      )}
    </div>
  )
}

function CardAgora({
  demanda: d,
  meuId,
  processando,
  confirmado,
  onAceitar,
  onRecusar,
  onPedirConfirmacaoChegada,
}: {
  demanda: DemandaVendaPublic
  meuId: string
  processando: boolean
  confirmado: boolean
  onAceitar: () => void
  onRecusar: () => void
  onPedirConfirmacaoChegada: () => void
}) {
  const aberto = d.motorista_id === null
  const meuPendente = d.motorista_id === meuId && d.status === "pendente"
  const meuAceito = d.motorista_id === meuId && d.status === "aceita"

  const tempo = meuAceito
    ? d.respondida_em && formatarTempoDecorrido(d.respondida_em)
    : formatarTempoDecorrido(d.created_at)

  return (
    <div style={estilos.card}>
      <div style={estilos.cardTopo}>
        <span style={estilos.cardTopoLabel}>
          {meuAceito ? "Em atendimento" : aberto ? "Chamado aberto" : "Chamado direto"}
        </span>
        {tempo && <span style={estilos.chipTempo}>{tempo}</span>}
      </div>

      <div style={estilos.cardInterno}>
        <span style={estilos.cliente}>{d.cliente_nome}</span>
        <span style={estilos.endereco}>{formatarEndereco(d)}</span>
        <span style={estilos.itens}>{formatarItens(d)}</span>
        {d.observacao && <span style={estilos.observacao}>{d.observacao}</span>}
      </div>

      {meuAceito ? (
        <button
          style={confirmado ? estilos.botaoCheguelConfirmado : estilos.botaoCheguei}
          disabled={processando || confirmado}
          onClick={onPedirConfirmacaoChegada}
        >
          {confirmado ? "Confirmado ✓" : processando ? "..." : "Cheguei"}
        </button>
      ) : (
        <>
          <button style={estilos.botaoAceitar} disabled={processando} onClick={onAceitar}>
            {processando ? "..." : "Aceitar chamado"}
          </button>
          {meuPendente && (
            <button style={estilos.botaoRecusar} disabled={processando} onClick={onRecusar}>
              Recusar
            </button>
          )}
        </>
      )}
    </div>
  )
}

function CardAtendida({ demanda: d }: { demanda: DemandaVendaPublic }) {
  return (
    <div style={estilos.cardAtendida}>
      <div style={estilos.cardTopo}>
        <span style={estilos.cardTopoLabelMuted}>Atendido</span>
        {d.finalizada_em && (
          <span style={estilos.chipTempoMuted}>
            {formatarTempoDecorrido(d.finalizada_em)} atrás
          </span>
        )}
      </div>
      <div style={estilos.cardInternoMuted}>
        <span style={estilos.clienteMuted}>{d.cliente_nome}</span>
        <span style={estilos.enderecoMuted}>{formatarEndereco(d)}</span>
        <span style={estilos.itensMuted}>{formatarItens(d)}</span>
      </div>
    </div>
  )
}

function estiloSubAba(ativa: boolean): CSSProperties {
  return {
    flex: 1,
    padding: "0.6rem",
    border: "none",
    borderBottom: `2px solid ${ativa ? CORES.destaque : "transparent"}`,
    background: "transparent",
    color: ativa ? CORES.destaque : CORES.textoSecundario,
    fontWeight: ativa ? 700 : 400,
    fontSize: "0.9rem",
  }
}

// Sem minHeight/100vh nem padding de safe-area aqui -- este
// componente é renderizado DENTRO da casca de navegação (TopBar +
// BottomNav) em App.tsx, que já cuida do espaçamento geral da página.
const estilos: Record<string, CSSProperties> = {
  pagina: {
    color: CORES.texto,
    fontFamily: "system-ui, sans-serif",
    padding: "1.25rem 1rem 0",
    boxSizing: "border-box",
  },
  titulo: { fontSize: "1.35rem", fontWeight: 700, margin: "0 0 0.75rem" },
  subAbas: {
    display: "flex",
    borderBottom: `1px solid ${CORES.borda}`,
    marginBottom: "1rem",
  },
  mensagem: { color: CORES.textoSecundario, textAlign: "center", marginTop: "2rem" },
  erro: { color: CORES.erro, fontSize: "0.875rem", marginBottom: "0.75rem" },
  lista: { display: "flex", flexDirection: "column", gap: "0.75rem", paddingBottom: "1rem" },

  // Card "Agora" (precisa ação ou em andamento) -- cinza claro por
  // fora, área branca por dentro, botão vermelho/azul conforme
  // estado. Visual de referência: cards de "Aceitar pedido" do iFood.
  card: {
    background: CORES.fundoCard,
    borderRadius: "0.85rem",
    padding: "0.75rem",
  },
  cardTopo: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 0.15rem 0.5rem",
  },
  cardTopoLabel: { fontSize: "0.8rem", fontWeight: 700, color: CORES.texto },
  chipTempo: {
    fontSize: "0.7rem",
    fontWeight: 700,
    color: CORES.textoSecundario,
    background: CORES.fundoCardInterno,
    padding: "0.2rem 0.5rem",
    borderRadius: "0.4rem",
  },
  cardInterno: {
    background: CORES.fundoCardInterno,
    borderRadius: "0.6rem",
    padding: "0.75rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.15rem",
    marginBottom: "0.6rem",
  },
  cliente: { fontWeight: 700, fontSize: "1rem", color: CORES.texto },
  endereco: { fontSize: "0.85rem", color: CORES.textoSecundario },
  itens: { fontSize: "0.8rem", color: CORES.textoSecundario },
  observacao: { fontSize: "0.78rem", fontStyle: "italic", color: CORES.textoSecundario },
  botaoAceitar: {
    width: "100%",
    padding: "0.75rem",
    borderRadius: "0.5rem",
    border: "none",
    background: CORES.destaque,
    color: CORES.destaqueTexto,
    fontWeight: 700,
    fontSize: "0.9rem",
  },
  botaoRecusar: {
    width: "100%",
    padding: "0.5rem",
    marginTop: "0.4rem",
    borderRadius: "0.5rem",
    border: "none",
    background: "transparent",
    color: CORES.textoSecundario,
    fontSize: "0.8rem",
  },
  botaoCheguei: {
    width: "100%",
    padding: "0.75rem",
    borderRadius: "0.5rem",
    border: "none",
    background: CORES.aceito,
    color: CORES.aceitoTexto,
    fontWeight: 700,
    fontSize: "0.9rem",
    transition: "background 0.2s ease",
  },
  // Flash verde de sucesso -- feedback visual rápido antes de
  // navegar pra Vendas (pedido do Ricardo).
  botaoCheguelConfirmado: {
    width: "100%",
    padding: "0.75rem",
    borderRadius: "0.5rem",
    border: "none",
    background: CORES.statusOn,
    color: "#FFFFFF",
    fontWeight: 700,
    fontSize: "0.9rem",
    transition: "background 0.2s ease",
  },

  // Card "Atendida" -- sem botão, visual mais apagado (referência:
  // seção "Em entrega"/histórico do iFood, sem call-to-action).
  cardAtendida: {
    background: CORES.fundoCard,
    borderRadius: "0.85rem",
    padding: "0.75rem",
    opacity: 0.85,
  },
  cardTopoLabelMuted: { fontSize: "0.75rem", fontWeight: 700, color: CORES.textoSecundario },
  chipTempoMuted: { fontSize: "0.7rem", color: CORES.textoSecundario },
  cardInternoMuted: {
    background: CORES.fundoCardInterno,
    borderRadius: "0.6rem",
    padding: "0.75rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.15rem",
  },
  clienteMuted: { fontWeight: 700, fontSize: "0.95rem", color: CORES.texto },
  enderecoMuted: { fontSize: "0.82rem", color: CORES.textoSecundario },
  itensMuted: { fontSize: "0.78rem", color: CORES.textoSecundario },
}

export default MinhasDemandas
