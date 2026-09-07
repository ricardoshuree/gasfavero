// [mcp-local harness] feature: vendas-motorista | plano: d865e550 | 2026-09-07 12:15:55
// App.tsx: passa usuario para VendasTela (motorista logado atribuído automaticamente)
import { Preferences } from "@capacitor/preferences"
import { useEffect, useState } from "react"
import BottomNav, { ALTURA_BOTTOMNAV_PX, type AbaId } from "./components/BottomNav"
import FinanceiroTela from "./components/FinanceiroTela"
import Login from "./components/Login"
import MinhasDemandas from "./components/MinhasDemandas"
import PerfilTela from "./components/PerfilTela"
import TopBar, { ALTURA_TOPBAR_PX } from "./components/TopBar"
import VendasTela from "./components/VendasTela"
import { desbloquearAudio } from "./lib/alarme"
import { fetchCurrentUser, getToken, logout, type UserMe } from "./lib/auth"
import { CORES_APP, CORES_LOGIN } from "./theme"

type Estado =
  | { fase: "verificando" }
  | { fase: "deslogado" }
  | { fase: "logado"; token: string; usuario: UserMe }
  | { fase: "erro"; mensagem: string }

const MOTORISTA_ID_KEY = "motorista_id"

type JanelaComPonteAndroid = Window & {
  AndroidFCM?: { sincronizar?: () => void }
}

function App() {
  const [estado, setEstado] = useState<Estado>({ fase: "verificando" })
  const [abaAtiva, setAbaAtiva] = useState<AbaId>("demandas")

  async function carregarSessao() {
    const token = await getToken()
    if (!token) {
      setEstado({ fase: "deslogado" })
      return
    }
    try {
      const usuario = await fetchCurrentUser(token)
      setEstado({ fase: "logado", token, usuario })
      await Preferences.set({ key: MOTORISTA_ID_KEY, value: usuario.id })
      ;(window as JanelaComPonteAndroid).AndroidFCM?.sincronizar?.()
    } catch {
      await logout()
      setEstado({ fase: "deslogado" })
    }
  }

  useEffect(() => {
    carregarSessao()
  }, [])

  useEffect(() => {
    function aoPrimeiroToque() {
      desbloquearAudio()
      document.removeEventListener("pointerdown", aoPrimeiroToque)
    }
    document.addEventListener("pointerdown", aoPrimeiroToque, { once: true })
    return () => document.removeEventListener("pointerdown", aoPrimeiroToque)
  }, [])

  async function handleLogout() {
    await logout()
    setAbaAtiva("demandas")
    setEstado({ fase: "deslogado" })
  }

  if (estado.fase === "verificando") {
    return <TelaCentral titulo="Gás Favero Motorista" subtitulo="Carregando..." />
  }

  if (estado.fase === "deslogado") {
    return <Login onSuccess={carregarSessao} />
  }

  if (estado.fase === "erro") {
    return <Login onSuccess={carregarSessao} />
  }

  const { token, usuario } = estado

  return (
    <div style={estilos.shell}>
      <TopBar token={token} motoristaId={usuario.id} />

      <main style={estilos.conteudo}>
        {abaAtiva === "demandas" && (
          <MinhasDemandas
            token={token}
            meuId={usuario.id}
            aoConcluirChamado={() => setAbaAtiva("vendas")}
          />
        )}
        {/* VendasTela recebe token e usuario (motorista logado é atribuído automaticamente) */}
        {abaAtiva === "vendas" && (
          <VendasTela token={token} usuario={usuario} />
        )}
        {abaAtiva === "financeiro" && <FinanceiroTela />}
        {abaAtiva === "perfil" && <PerfilTela usuario={usuario} onLogout={handleLogout} />}
      </main>

      <BottomNav abaAtiva={abaAtiva} onMudarAba={setAbaAtiva} />
    </div>
  )
}

function TelaCentral({ titulo, subtitulo }: { titulo: string; subtitulo: string }) {
  return (
    <div style={estilos.splash}>
      <h1 style={estilos.splashTitulo}>{titulo}</h1>
      <p style={estilos.splashSubtitulo}>{subtitulo}</p>
    </div>
  )
}

const estilos = {
  shell: {
    minHeight: "100vh",
    background: CORES_APP.fundo,
  },
  conteudo: {
    paddingTop: `calc(${ALTURA_TOPBAR_PX}px + env(safe-area-inset-top))`,
    paddingBottom: `calc(${ALTURA_BOTTOMNAV_PX}px + env(safe-area-inset-bottom))`,
    minHeight: "100vh",
    boxSizing: "border-box" as const,
  },
  splash: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: "0.75rem",
    padding:
      "max(1.5rem, env(safe-area-inset-top)) max(1.5rem, env(safe-area-inset-right)) max(1.5rem, env(safe-area-inset-bottom)) max(1.5rem, env(safe-area-inset-left))",
    textAlign: "center" as const,
    fontFamily: "system-ui, sans-serif",
    background: CORES_LOGIN.fundo,
    color: CORES_LOGIN.texto,
    boxSizing: "border-box" as const,
  },
  splashTitulo: { fontSize: "1.5rem", fontWeight: 700, color: CORES_LOGIN.texto },
  splashSubtitulo: { color: CORES_LOGIN.texto, opacity: 0.75 },
}

export default App
