// [mcp-local harness] feature: delegacao-venda-fase3-mapa | plano: caf9c096 | 2026-08-07 07:07:12
// Remove loading=async (causava google.maps.Map is not a constructor); volta pro carregamento classico sincrono
import { useEffect, useState } from "react"

const SCRIPT_ID = "google-maps-js-api"

/**
 * Carrega o script da Google Maps JavaScript API uma única vez --
 * idempotente: várias chamadas de useGoogleMapsScript (de
 * componentes diferentes, ou remounts) não duplicam a tag <script>,
 * todas compartilham o mesmo carregamento via callback global.
 *
 * Carregamento CLÁSSICO de propósito (sem `loading=async`): com
 * `loading=async`, o Google só expõe `google.maps.importLibrary()`
 * no callback, não as classes em si (`google.maps.Map` fica
 * indefinida/stub até um `await importLibrary("maps")` explícito) --
 * gerava "window.google.maps.Map is not a constructor" em teste
 * real. Sem esse parâmetro, o callback só dispara depois que TODA a
 * API (Map, Marker, InfoWindow) já está populada em `window.google`,
 * que é o que MapaMotoristas espera. Console mostra um aviso de
 * depreciação do Google sobre isso -- inofensivo, é só recomendação,
 * não quebra nada.
 *
 * Fase 3 da Delegação de Venda: usado hoje só pelo MapaMotoristas.
 * Ver comentário sobre a API key em frontend/.env
 * (VITE_GOOGLE_MAPS_API_KEY).
 */
export function useGoogleMapsScript(): { loaded: boolean; error: string | null } {
  const [loaded, setLoaded] = useState(() => Boolean(window.google?.maps?.Map))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (window.google?.maps?.Map) {
      setLoaded(true)
      return
    }

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as
      | string
      | undefined
    if (!apiKey) {
      setError(
        "VITE_GOOGLE_MAPS_API_KEY não configurada no .env do frontend",
      )
      return
    }

    const existing = document.getElementById(
      SCRIPT_ID,
    ) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener("load", () => setLoaded(true))
      return
    }

    window.__onGoogleMapsLoaded = () => setLoaded(true)

    const script = document.createElement("script")
    script.id = SCRIPT_ID
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=__onGoogleMapsLoaded`
    script.async = true
    script.onerror = () => setError("Falha ao carregar o script do Google Maps")
    document.head.appendChild(script)
  }, [])

  return { loaded, error }
}
