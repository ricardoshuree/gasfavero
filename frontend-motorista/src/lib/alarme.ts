// [mcp-local harness] feature: selecao-som-alerta | plano: b142e4e6 | 2026-09-08 14:49:40
// Lê som selecionado do localStorage; recria elemento de áudio ao trocar
// Sons do app do motorista.
// O alerta de chamado novo toca o arquivo MP3 selecionado pelo motorista
// (salvo em localStorage sob a chave CHAVE_SOM). Padrão: Padrao.mp3.
// O som de cancelamento é sintetizado via Web Audio API (uma vez só, sem loop).
//
// Política de autoplay: desbloquearAudio() deve ser chamado na primeira
// interação do usuário (ver App.tsx) para destravá-lo antes do primeiro alarme.

export const CHAVE_SOM = "alerta_som_selecionado"
export const SOM_PADRAO = "/sounds/Padrao.mp3"

export const SONS_DISPONIVEIS = [
  { label: "Padrão",       arquivo: "/sounds/Padrao.mp3" },
  { label: "Sem Problema", arquivo: "/sounds/Sem Problema.mp3" },
  { label: "Toque Suave",  arquivo: "/sounds/Toque Suave.mp3" },
  { label: "Guitarra",     arquivo: "/sounds/Guitarra.mp3" },
]

function somAtual(): string {
  return localStorage.getItem(CHAVE_SOM) ?? SOM_PADRAO
}

let elementoAudioChamado: HTMLAudioElement | null = null
let caminhoCarregado: string | null = null
let audioCtx: AudioContext | null = null

function obterElementoChamado(): HTMLAudioElement {
  const caminho = somAtual()
  // Recria o elemento se o som tiver mudado desde a última vez
  if (!elementoAudioChamado || caminhoCarregado !== caminho) {
    if (elementoAudioChamado) {
      elementoAudioChamado.pause()
      elementoAudioChamado.src = ""
    }
    elementoAudioChamado = new Audio(caminho)
    elementoAudioChamado.loop = true
    elementoAudioChamado.preload = "auto"
    caminhoCarregado = caminho
  }
  return elementoAudioChamado
}

function obterContextoSintetizado(): AudioContext {
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    audioCtx = new Ctor()
  }
  return audioCtx
}

/** Chamar uma vez na primeira interação do usuário (App.tsx) para
 *  destravar o autoplay antes do primeiro alarme. */
export function desbloquearAudio(): void {
  const audio = obterElementoChamado()
  audio.play().then(() => { audio.pause(); audio.currentTime = 0 }).catch(() => {})
  const ctx = obterContextoSintetizado()
  if (ctx.state === "suspended") ctx.resume().catch(() => {})
}

/** Toca o som de alerta de chamado novo em loop até pararAlarme(). */
export function iniciarAlarme(): void {
  const audio = obterElementoChamado()
  audio.currentTime = 0
  audio.play().catch(() => {})
}

export function pararAlarme(): void {
  if (!elementoAudioChamado) return
  elementoAudioChamado.pause()
  elementoAudioChamado.currentTime = 0
}

/** Preview de um som específico (para a tela de configurações).
 *  Toca uma vez e para automaticamente no fim. */
export function previewSom(arquivo: string): void {
  const audio = new Audio(arquivo)
  audio.loop = false
  audio.play().catch(() => {})
}

/** Som de cancelamento — sintetizado, distinto do alerta de chamado. */
export function tocarSomCancelamento(): void {
  try {
    const ctx = obterContextoSintetizado()
    if (ctx.state === "suspended") ctx.resume().catch(() => {})
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
    tocarNota(440, 0, 0.18)
    tocarNota(293.66, 0.16, 0.28)
  } catch {
    // Sem suporte a Web Audio — segue sem som.
  }
}
