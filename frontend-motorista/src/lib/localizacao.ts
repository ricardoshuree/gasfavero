// [mcp-local harness] feature: frontend-motorista-fix-localizacao | plano: d3ce7507 | 2026-08-07 18:45:15
// Arredonda lat/lng pra 6 casas decimais antes de enviar (corrige 422)
import { request } from "./api"

// Ping de localização do motorista -- reaproveita o endpoint que já
// existe desde a Fase 2 (PUT /motoristas/{id}/localizacao, upsert
// puro, sem histórico). "Disponível" pro motorista = estar mandando
// ping; não existe (ainda) um campo booleano explícito de
// disponibilidade no backend -- se o painel do atendente precisar
// saber "está online AGORA" de forma explícita (não só "última
// posição há X minutos"), aí sim vai precisar de um campo novo.
//
// ATENÇÃO -- limitação conhecida: em ambiente nativo (Android via
// Capacitor), a API navigator.geolocation do navegador pode não
// funcionar de forma confiável dentro do WebView sem o plugin
// @capacitor/geolocation + permissão ACCESS_FINE_LOCATION declarada
// no AndroidManifest.xml. Funciona no navegador (dev) e deve ser
// revisitado antes de testar em dispositivo/emulador real.

const INTERVALO_PADRAO_MS = 20_000

// Backend valida decimal_places=6 (MotoristaLocalizacaoUpdate,
// models.py) -- navigator.geolocation devolve float com muito mais
// casas decimais (ex: 15+), o que estourava a validação e retornava
// 422 em toda tentativa de ping. Arredondar aqui é obrigatório.
function arredondar6(valor: number): number {
  return Math.round(valor * 1e6) / 1e6
}

async function enviarPing(token: string, motoristaId: string): Promise<void> {
  const posicao = await new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocalização não suportada neste ambiente"))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10_000,
    })
  })

  await request(`/api/v1/motoristas/${motoristaId}/localizacao`, {
    method: "PUT",
    token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      latitude: arredondar6(posicao.coords.latitude),
      longitude: arredondar6(posicao.coords.longitude),
    }),
  })
}

/** Começa a mandar ping periódico. Retorna o id do interval (pra
 * passar em pararPing depois). Dispara um ping imediato + repete a
 * cada intervaloMs. */
function iniciarPing(
  token: string,
  motoristaId: string,
  aoErro: (mensagem: string) => void,
  intervaloMs: number = INTERVALO_PADRAO_MS,
): number {
  const tentar = () => {
    enviarPing(token, motoristaId).catch(() => {
      aoErro("Não foi possível obter/enviar sua localização.")
    })
  }
  tentar()
  return window.setInterval(tentar, intervaloMs)
}

function pararPing(intervalId: number): void {
  window.clearInterval(intervalId)
}

export { iniciarPing, pararPing }
