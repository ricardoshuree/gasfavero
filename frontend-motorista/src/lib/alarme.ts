// [mcp-local harness] feature: fase4-motorista-disponibilidade-cancelamento | plano: ab68610c | 2026-08-08 11:43:52
// Adiciona tocarSomCancelamento() -- som distinto (sintetizado) do ding-dong, dispara uma vez so (nao loop)
// Sons do app do motorista -- gerados via Web Audio API (ding-dong
// pro alerta de chamado novo) ou tocados via arquivo de verdade
// (public/sounds/alerta-chamado.mp3, baixado de
// notificationsounds.com). Funciona só com o app em primeiro plano
// (ver comentário em AlertaChamado.tsx sobre a diferença pra push
// notification de verdade).
//
// IMPORTANTE -- política de autoplay do navegador/WebView: um
// elemento <audio> (ou AudioContext) não tem permissão de tocar
// sozinho até o usuário interagir com a página pelo menos uma vez
// (toque/clique). Como o alerta é disparado pelo polling em segundo
// plano (sem toque do usuário naquele momento exato), o som
// simplesmente não tocaria -- sem erro nenhum, só silêncio. A
// correção é "destravar" o áudio na PRIMEIRA interação do usuário com
// o app (ver desbloquearAudio(), chamado uma vez no App.tsx), bem
// antes de qualquer alarme precisar tocar.

const CAMINHO_SOM_CHAMADO = "/sounds/alerta-chamado.mp3"

let elementoAudioChamado: HTMLAudioElement | null = null
let audioCtx: AudioContext | null = null

function obterElementoChamado(): HTMLAudioElement {
  if (!elementoAudioChamado) {
    elementoAudioChamado = new Audio(CAMINHO_SOM_CHAMADO)
    elementoAudioChamado.loop = true
    elementoAudioChamado.preload = "auto"
  }
  return elementoAudioChamado
}

function obterContextoSintetizado(): AudioContext {
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    audioCtx = new Ctor()
  }
  return audioCtx
}

/** Chamar uma vez, na primeira interação do usuário com o app
 * (ver App.tsx) -- toca e pausa imediatamente (volume real, duração
 * ~0) só pra "destravar" o elemento de áudio pra alarmes futuros
 * disparados sem toque direto (ex: pelo polling em segundo plano).
 * Também "acorda" o AudioContext sintetizado usado no som de
 * cancelamento. */
function desbloquearAudio(): void {
  const audio = obterElementoChamado()
  audio
    .play()
    .then(() => {
      audio.pause()
      audio.currentTime = 0
    })
    .catch(() => {
      // Sem problema se falhar aqui -- iniciarAlarme() tenta de novo
    })

  const ctx = obterContextoSintetizado()
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {})
  }
}

/** Começa a tocar o alerta de CHAMADO NOVO em loop até pararAlarme()
 * ser chamado. */
function iniciarAlarme(): void {
  const audio = obterElementoChamado()
  audio.currentTime = 0
  audio.play().catch(() => {
    // Se o autoplay ainda estiver bloqueado (desbloquearAudio nunca
    // rodou), o alerta visual continua funcionando mesmo sem som.
  })
}

function pararAlarme(): void {
  if (!elementoAudioChamado) return
  elementoAudioChamado.pause()
  elementoAudioChamado.currentTime = 0
}

/** Som de CANCELAMENTO -- distinto do ding-dong de chamado novo de
 * propósito (Ricardo pediu "característico ao evento"). Toca só UMA
 * vez (não é loop -- cancelamento não exige ação imediata como um
 * chamado novo, só avisa). Sintetizado (duas notas descendentes,
 * tom mais "seco") em vez de arquivo -- pode virar um MP3 de verdade
 * depois, mesmo padrão do alerta de chamado, se o Ricardo escolher
 * um som específico em notificationsounds.com. */
function tocarSomCancelamento(): void {
  try {
    const ctx = obterContextoSintetizado()
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {})
    }
    const tocarNota = (freq: number, inicioRelativoS: number, duracaoS: number) => {
      const osc = ctx.createOscillator()
      const ganho = ctx.createGain()
      const inicio = ctx.currentTime + inicioRelativoS
      osc.type = "square"
      osc.frequency.value = freq
      ganho.gain.setValueAtTime(0.0001, inicio)
      ganho.gain.exponentialRampToValueAtTime(0.18, inicio + 0.02)
      ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracaoS)
      osc.connect(ganho)
      ganho.connect(ctx.destination)
      osc.start(inicio)
      osc.stop(inicio + duracaoS)
    }
    // Duas notas descendentes, tom "square" mais seco -- propositalmente
    // diferente do "ding-dong" sino do chamado novo.
    tocarNota(440, 0, 0.18)
    tocarNota(293.66, 0.16, 0.28)
  } catch {
    // Sem suporte a Web Audio -- segue sem som, o visual já avisa.
  }
}

export { iniciarAlarme, pararAlarme, desbloquearAudio, tocarSomCancelamento }
