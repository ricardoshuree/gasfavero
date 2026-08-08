// [mcp-local harness] feature: frontend-motorista-som-arquivo-real | plano: ee27d3a1 | 2026-08-07 20:52:26
// Toca public/sounds/alerta-chamado.mp3 em loop via elemento audio, em vez do bipe sintetizado
// Som do alerta de chamada -- arquivo de áudio de verdade
// (public/sounds/alerta-chamado.mp3, baixado de
// notificationsounds.com -- ver memória/documentação do projeto),
// tocado em loop via elemento <audio> enquanto o alerta estiver na
// tela. Funciona só com o app em primeiro plano (ver comentário em
// AlertaChamado.tsx sobre a diferença pra push notification de
// verdade).
//
// IMPORTANTE -- política de autoplay do navegador/WebView: um
// elemento <audio> não tem permissão de tocar sozinho até o usuário
// interagir com a página pelo menos uma vez (toque/clique). Como o
// alerta é disparado pelo polling em segundo plano (sem toque do
// usuário naquele momento exato), o som simplesmente não tocaria --
// sem erro nenhum, só silêncio. A correção é "destravar" o áudio na
// PRIMEIRA interação do usuário com o app (ver desbloquearAudio(),
// chamado uma vez no App.tsx), bem antes de qualquer alarme precisar
// tocar.

const CAMINHO_SOM = "/sounds/alerta-chamado.mp3"

let elementoAudio: HTMLAudioElement | null = null

function obterElemento(): HTMLAudioElement {
  if (!elementoAudio) {
    elementoAudio = new Audio(CAMINHO_SOM)
    elementoAudio.loop = true
    elementoAudio.preload = "auto"
  }
  return elementoAudio
}

/** Chamar uma vez, na primeira interação do usuário com o app
 * (ver App.tsx) -- toca e pausa imediatamente (volume real, duração
 * ~0) só pra "destravar" o elemento de áudio pra alarmes futuros
 * disparados sem toque direto (ex: pelo polling em segundo plano). */
function desbloquearAudio(): void {
  const audio = obterElemento()
  audio
    .play()
    .then(() => {
      audio.pause()
      audio.currentTime = 0
    })
    .catch(() => {
      // Sem problema se falhar aqui -- iniciarAlarme() tenta de novo
    })
}

/** Começa a tocar o alerta em loop até pararAlarme() ser chamado. */
function iniciarAlarme(): void {
  const audio = obterElemento()
  audio.currentTime = 0
  audio.play().catch(() => {
    // Se o autoplay ainda estiver bloqueado (desbloquearAudio nunca
    // rodou), o alerta visual continua funcionando mesmo sem som.
  })
}

function pararAlarme(): void {
  if (!elementoAudio) return
  elementoAudio.pause()
  elementoAudio.currentTime = 0
}

export { iniciarAlarme, pararAlarme, desbloquearAudio }
