// [mcp-local harness] feature: frontend-motorista-ajustes-usabilidade | plano: 00bcba9d | 2026-08-07 20:01:04
// Adiciona desbloquearAudio() (resume o AudioContext) -- chamado na primeira interacao do usuario, resolve o alarme mudo por bloqueio de autoplay
// Som do alerta de chamada -- gerado via Web Audio API (bipe
// sintético), sem depender de arquivo de áudio externo. Funciona só
// com o app em primeiro plano (ver comentário em AlertaChamado.tsx
// sobre a diferença pra push notification de verdade).
//
// IMPORTANTE -- política de autoplay do navegador/WebView: um
// AudioContext nasce "suspenso" até o usuário interagir com a página
// pelo menos uma vez (toque/clique). Como o alarme é disparado pelo
// polling em segundo plano (sem toque do usuário naquele momento
// exato), o som simplesmente não tocava -- sem erro nenhum, só
// silêncio. A correção é "destravar" o contexto de áudio na PRIMEIRA
// interação do usuário com o app (ver desbloquearAudio(), chamado uma
// vez no App.tsx), bem antes de qualquer alarme precisar tocar.

let audioCtx: AudioContext | null = null

function obterContexto(): AudioContext {
  if (!audioCtx) {
    // webkitAudioContext -- fallback pra WebViews mais antigas
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    audioCtx = new Ctor()
  }
  return audioCtx
}

/** Chamar uma vez, na primeira interação do usuário com o app
 * (ver App.tsx) -- "destrava" o áudio pra alarmes futuros disparados
 * sem toque direto (ex: pelo polling em segundo plano). */
function desbloquearAudio(): void {
  const ctx = obterContexto()
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {
      // Sem problema se falhar aqui -- tocarBipe() tenta de novo
    })
  }
}

function tocarBipe(): void {
  try {
    const ctx = obterContexto()
    if (ctx.state === "suspended") {
      // Ainda suspenso (ex: desbloquearAudio nunca rodou) -- tenta
      // retomar mesmo assim, best-effort.
      ctx.resume().catch(() => {})
    }
    const osc = ctx.createOscillator()
    const ganho = ctx.createGain()
    osc.type = "sine"
    osc.frequency.value = 880
    ganho.gain.setValueAtTime(0.0001, ctx.currentTime)
    ganho.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.02)
    ganho.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
    osc.connect(ganho)
    ganho.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.35)
  } catch {
    // Ambiente sem suporte a Web Audio (raro) -- alerta visual
    // continua funcionando mesmo sem som.
  }
}

/** Começa a repetir o bipe (estilo alarme) até pararAlarme() ser
 * chamado. Retorna o id do interval. */
function iniciarAlarme(): number {
  tocarBipe()
  return window.setInterval(tocarBipe, 700)
}

function pararAlarme(intervalId: number): void {
  window.clearInterval(intervalId)
}

export { iniciarAlarme, pararAlarme, desbloquearAudio }
