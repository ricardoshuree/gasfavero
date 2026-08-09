// [mcp-local harness] feature: deeplink-google-maps | plano: c4f195c2 | 2026-08-09 13:43:13
// Adiciona botao Abrir no Google Maps no card do chamado aceito, com deep-link google.navigation
// [mcp-local harness] feature: deeplink-google-maps | plano: c4f195c2 | 2026-08-09
// Adiciona botao "Abrir no Google Maps" no card do chamado aceito -- deep-link via window.open(url, "_system")
// [mcp-local harness] feature: ajuste-cinza-cancelado-35 | plano: 12363cb8 | 2026-08-08 12:23:39
// Cinza do card Cancelado ajustado de #5C5C5C (60%) para #A6A6A6 (35%)
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react"
import { iniciarAlarme, pararAlarme, tocarSomCancelamento } from "../lib/alarme"
import { ApiError } from "../lib/api"
import {
  aceitarDemanda,
  concluirDemanda,
  type DemandaVendaPublic,
  type EnderecoPublic,
  listarDemandas,
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

// Quanto tempo o card "Chamada cancelada" (botão preto) fica visível
// na aba Agora antes de sumir sozinho -- pedido do Ricardo. Some
// antes disso se o motorista tocar nele manualmente.
const LINGER_CANCELADO_MS = 15_000

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

/** Deep-link pro app nativo do Google Maps, já em modo de navegação
 * turn-by-turn (não só um pin) -- esquema `google.navigation:`
 * reconhecido pelo próprio app do Maps no Android. Usa as
 * coordenadas que já vêm no payload do endereço (geocodificadas na
 * criação do chamado, ver delegacao.py); zero custo de API adicional
 * aqui, nenhuma chamada nova ao Google.
 *
 * `window.open(url, "_system")` -- dentro da WebView do Capacitor,
 * o target "_system" delega pro handler nativo do Android (abre o
 * Google Maps se só um app de navegação estiver instalado, ou o
 * seletor do sistema se houver mais de um). Não precisa de nenhum
 * plugin do Capacitor pra isso. */
function abrirNoGoogleMaps(endereco: EnderecoPublic) {
  if (endereco.latitude == null || endereco.longitude == null) return
  const url = `google.navigation:q=${endereco.latitude},${endereco.longitude}&mode=d`
  window.open(url, "_system")
}

/** Chamados que "precisam de ação" -- abertos (qualquer um aceita)
 * ou convites diretos pendentes pra mim. É essa lista que alimenta a
 * detecção de "chamado novo" pro alarme. */
function idsPrecisandoAcao(agora: DemandaVendaPublic[], meuId: string): Set<string> {
  return new Set(
    agora
      .filter((d) => d.motorista_id === null || (d.motorista_id === meuId && d.status === "pendente"))
      .map((d) => d.id),
  )
}

/** Chamados que são "meus e ativos" AGORA (pendente ou aceita, e
 * motorista_id sou eu) -- usado pra detectar cancelamento (estava
 * aqui, não está mais / virou 'cancelada') e reatribuição (estava
 * aqui, motorista_id mudou pra outra pessoa). */
function mapaMeusAtivos(
  todas: DemandaVendaPublic[],
  meuId: string,
): Map<string, DemandaVendaPublic> {
  return new Map(
    todas
      .filter(
        (d) => d.motorista_id === meuId && (d.status === "pendente" || d.status === "aceita"),
      )
      .map((d) => [d.id, d]),
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
  const [canceladosRecentes, setCanceladosRecentes] = useState<
    Map<string, DemandaVendaPublic>
  >(new Map())

  const idsVistosRef = useRef<Set<string> | null>(null)
  const meusAtivosAnterioresRef = useRef<Map<string, DemandaVendaPublic> | null>(null)
  const canceladosRecentesIdsRef = useRef<Set<string>>(new Set())
  const alarmeTocandoRef = useRef(false)

  const pararAlarmeSonoro = useCallback(() => {
    if (alarmeTocandoRef.current) {
      pararAlarme()
      alarmeTocandoRef.current = false
    }
  }, [])

  const removerCanceladoRecente = useCallback((id: string) => {
    canceladosRecentesIdsRef.current.delete(id)
    setCanceladosRecentes((prev) => {
      if (!prev.has(id)) return prev
      const novo = new Map(prev)
      novo.delete(id)
      return novo
    })
  }, [])

  const adicionarCanceladoRecente = useCallback(
    (demanda: DemandaVendaPublic) => {
      if (canceladosRecentesIdsRef.current.has(demanda.id)) return
      canceladosRecentesIdsRef.current.add(demanda.id)
      setCanceladosRecentes((prev) => {
        const novo = new Map(prev)
        novo.set(demanda.id, demanda)
        return novo
      })
      tocarSomCancelamento()
      window.setTimeout(() => removerCanceladoRecente(demanda.id), LINGER_CANCELADO_MS)
    },
    [removerCanceladoRecente],
  )

  const carregar = useCallback(async () => {
    try {
      const todas = await listarDemandas(token)
      const separadas = separarChamadas(todas, meuId)
      setAgora(separadas.agora)
      setAtendidas(separadas.atendidas)
      setErro(null)

      // Detecção de CANCELAMENTO -- compara "meus ativos" desta
      // leitura com a anterior. Se um chamado que era meu (pendente
      // ou aceita) agora está 'cancelada', é o atendente que
      // cancelou -- avisa com som distinto + card preto lingering.
      // Se sumiu de "meus ativos" por outro motivo (motorista_id
      // mudou pra outra pessoa = reatribuído), fica em silêncio de
      // propósito -- nunca foi meu de verdade.
      if (meusAtivosAnterioresRef.current !== null) {
        for (const [id] of meusAtivosAnterioresRef.current) {
          const atual = todas.find((d) => d.id === id)
          if (atual && atual.status === "cancelada" && atual.motorista_id === meuId) {
            adicionarCanceladoRecente(atual)
          }
        }
      }
      meusAtivosAnterioresRef.current = mapaMeusAtivos(todas, meuId)

      // Detecção de "chamado novo" -- compara com a leitura
      // anterior. Na primeira carga só registra o estado atual (sem
      // disparar alarme pro que já existia antes de abrir o app).
      const idsAtuais = idsPrecisandoAcao(separadas.agora, meuId)
      if (idsVistosRef.current !== null) {
        const novos = [...idsAtuais].filter((id) => !idsVistosRef.current!.has(id))
        if (novos.length > 0 && !alarmeTocandoRef.current) {
          const chamadoNovo = separadas.agora.find((d) => d.id === novos[0])
          if (chamadoNovo) {
            setAlertaChamado(chamadoNovo)
            iniciarAlarme()
            alarmeTocandoRef.current = true
          }
        }
      }
      idsVistosRef.current = idsAtuais
    } catch {
      setErro("Não foi possível carregar os chamados.")
    } finally {
      setCarregando(false)
    }
  }, [token, meuId, adicionarCanceladoRecente])

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
    } catch (e) {
      // 400 aqui quase sempre significa "outro motorista já aceitou
      // esse mesmo chamado aberto entre o carregamento da tela e o
      // seu toque" -- corrida normal em chamado aberto, não é bug.
      // Mensagem específica em vez do genérico "tente de novo".
      if (e instanceof ApiError && e.status === 400) {
        setErro("Esse chamado já foi assumido por outro motorista.")
      } else {
        setErro("Não foi possível aceitar o chamado. Tente de novo.")
      }
      await carregar()
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

  /** "Recusar" do alerta pra chamados ABERTOS -- 100% local, não
   * chama a API. Só fecha a tela e para o alarme pra este aparelho;
   * o chamado continua pendente/aberto pra qualquer motorista (ver
   * comentário de regra de negócio em AlertaChamado.tsx). */
  function handleDispensarAlerta() {
    pararAlarmeSonoro()
    setAlertaChamado(null)
  }

  const listaAgoraComCancelados = [...agora, ...canceladosRecentes.values()]
  const listaAtiva = subAba === "agora" ? listaAgoraComCancelados : atendidas
  const chamadoConfirmando = agora.find((d) => d.id === confirmandoChegadaId) ?? null

  return (
    <div style={estilos.pagina}>
      <h1 style={estilos.titulo}>Chamadas</h1>

      <div style={estilos.subAbas}>
        <button style={estiloSubAba(subAba === "agora")} onClick={() => setSubAba("agora")}>
          Agora{listaAgoraComCancelados.length > 0 ? ` (${listaAgoraComCancelados.length})` : ""}
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
          ? listaAgoraComCancelados.map((d) =>
              d.status === "cancelada" ? (
                <CardCancelado
                  key={d.id}
                  demanda={d}
                  onDispensar={() => removerCanceladoRecente(d.id)}
                />
              ) : (
                <CardAgora
                  key={d.id}
                  demanda={d}
                  meuId={meuId}
                  processando={processando === d.id}
                  confirmado={confirmadoId === d.id}
                  onAceitar={() => handleAceitar(d.id)}
                  onPedirConfirmacaoChegada={() => setConfirmandoChegadaId(d.id)}
                />
              ),
            )
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
          onDispensar={handleDispensarAlerta}
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
  onPedirConfirmacaoChegada,
}: {
  demanda: DemandaVendaPublic
  meuId: string
  processando: boolean
  confirmado: boolean
  onAceitar: () => void
  onPedirConfirmacaoChegada: () => void
}) {
  const aberto = d.motorista_id === null
  const meuAceito = d.motorista_id === meuId && d.status === "aceita"
  const temCoordenadas = d.endereco.latitude != null && d.endereco.longitude != null

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
        <>
          {temCoordenadas && (
            <button style={estilos.botaoMaps} onClick={() => abrirNoGoogleMaps(d.endereco)}>
              Abrir no Google Maps
            </button>
          )}
          <button
            style={confirmado ? estilos.botaoCheguelConfirmado : estilos.botaoCheguei}
            disabled={processando || confirmado}
            onClick={onPedirConfirmacaoChegada}
          >
            {confirmado ? "Confirmado ✓" : processando ? "..." : "Cheguei"}
          </button>
        </>
      ) : (
        // Sem opção de recusar aqui -- nem aberto nem convite direto
        // (ver regra de negócio documentada em AlertaChamado.tsx).
        <button style={estilos.botaoAceitar} disabled={processando} onClick={onAceitar}>
          {processando ? "..." : "Aceitar chamado"}
        </button>
      )}
    </div>
  )
}

/** Card "lingering" pra chamado CANCELADO pelo atendente -- fica na
 * aba Agora por até 15s (ou até o motorista tocar) antes de sumir
 * de vez (a partir daí só existe mais na aba Atendidas, já
 * reclassificado por separarChamadas). Botão PRETO de propósito --
 * visualmente bem diferente de aceitar/cheguei, deixa claro que não
 * precisa fazer mais nada com esse chamado. */
function CardCancelado({
  demanda: d,
  onDispensar,
}: {
  demanda: DemandaVendaPublic
  onDispensar: () => void
}) {
  return (
    <div style={estilos.card}>
      <div style={estilos.cardTopo}>
        <span style={estilos.cardTopoLabel}>Chamado cancelado</span>
      </div>
      <div style={estilos.cardInterno}>
        <span style={estilos.cliente}>{d.cliente_nome}</span>
        <span style={estilos.endereco}>{formatarEndereco(d)}</span>
      </div>
      <button style={estilos.botaoCancelado} onClick={onDispensar}>
        Chamada cancelada
      </button>
    </div>
  )
}

function CardAtendida({ demanda: d }: { demanda: DemandaVendaPublic }) {
  const cancelado = d.status === "cancelada"
  return (
    <div style={cancelado ? estilos.cardAtendidaCancelada : estilos.cardAtendida}>
      <div style={estilos.cardTopo}>
        <span style={cancelado ? estilos.labelCanceladoTopo : estilos.cardTopoLabelMuted}>
          {cancelado ? "Cancelado" : "Atendido"}
        </span>
        {d.finalizada_em && (
          <span style={cancelado ? estilos.chipTempoCancelado : estilos.chipTempoMuted}>
            {formatarTempoDecorrido(d.finalizada_em)} atrás
          </span>
        )}
      </div>
      <div style={cancelado ? estilos.cardInternoCancelado : estilos.cardInternoMuted}>
        <span style={cancelado ? estilos.clienteCancelado : estilos.clienteMuted}>
          {d.cliente_nome}
        </span>
        <span style={cancelado ? estilos.textoCancelado : estilos.enderecoMuted}>
          {formatarEndereco(d)}
        </span>
        <span style={cancelado ? estilos.textoCancelado : estilos.itensMuted}>
          {formatarItens(d)}
        </span>
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
//
// Card "Cancelado" (aba Atendidas) usa CORES SÓLIDAS de propósito
// (não opacity) -- opacity esmaece fundo E texto na mesma proporção,
// o que deixava o card praticamente ilegível (feedback do Ricardo:
// motoristas com dificuldade de visão não conseguiam ler). Fundo
// cinza sólido (35% preto -- 60% ficou pesado demais no teste real
// com o Ricardo) + texto preto/quase-preto por cima dá contraste de
// verdade, sem depender de transparência.
const CINZA_CANCELADO = "#A6A6A6"

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
  // "Abrir no Google Maps" -- secundário, fica ACIMA do "Cheguei"
  // (ação primária). Outline com a mesma cor do "Cheguei" (azul,
  // estado "aceito") pra sinalizar visualmente que pertence ao mesmo
  // momento do fluxo, mas sem competir com a ação principal.
  botaoMaps: {
    width: "100%",
    padding: "0.65rem",
    borderRadius: "0.5rem",
    border: `1.5px solid ${CORES.aceito}`,
    background: "#FFFFFF",
    color: CORES.aceito,
    fontWeight: 700,
    fontSize: "0.85rem",
    marginBottom: "0.5rem",
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
  botaoCancelado: {
    width: "100%",
    padding: "0.75rem",
    borderRadius: "0.5rem",
    border: "none",
    background: "#000000",
    color: "#FFFFFF",
    fontWeight: 700,
    fontSize: "0.9rem",
  },

  // "Atendido" (concluído de verdade) -- card claro normal, sem
  // opacity (não precisava, contraste já era bom).
  cardAtendida: {
    background: CORES.fundoCard,
    borderRadius: "0.85rem",
    padding: "0.75rem",
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

  // "Cancelado" -- cinza SÓLIDO + texto preto, contraste real (ver
  // comentário grande acima da const CINZA_CANCELADO).
  cardAtendidaCancelada: {
    background: CINZA_CANCELADO,
    borderRadius: "0.85rem",
    padding: "0.75rem",
  },
  labelCanceladoTopo: { fontSize: "0.75rem", fontWeight: 700, color: "#000000" },
  chipTempoCancelado: { fontSize: "0.7rem", fontWeight: 700, color: "#000000" },
  cardInternoCancelado: {
    background: "rgba(255,255,255,0.25)",
    borderRadius: "0.6rem",
    padding: "0.75rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.15rem",
  },
  clienteCancelado: {
    fontWeight: 700,
    fontSize: "0.95rem",
    color: "#000000",
    textDecoration: "line-through",
  },
  textoCancelado: { fontSize: "0.82rem", color: "#1A1A1A", fontWeight: 500 },
}

export default MinhasDemandas
