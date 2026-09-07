// [mcp-local harness] feature: recebimento-fiado-motorista | plano: 2701b061 | 2026-09-07 13:03:54
// App.tsx: sub-navegação no módulo Financeiro (Livro de Vendas / Receber Fiado), adiciona RecebimentoFiadoTela
import { Preferences } from "@capacitor/preferences"
import { useEffect, useState } from "react"
import BottomNav, { ALTURA_BOTTOMNAV_PX, type AbaId } from "./components/BottomNav"
import FinanceiroTela from "./components/FinanceiroTela"
import Login from "./components/Login"
import MinhasDemandas from "./components/MinhasDemandas"
import PerfilTela from "./components/PerfilTela"
import RecebimentoFiadoTela from "./components/RecebimentoFiadoTela"
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

// Sub-abas do módulo Financeiro
type SubAbaFinanceiro = "livro" | "fiado"

const MOTORISTA_ID_KEY = "motorista_id"

type JanelaComPonteAndroid = Window & {
  AndroidFCM?: { sincronizar?: () => void }
}

function App() {
  const [estado, setEstado] = useState<Estado>({ fase: "verificando" })
  const [abaAtiva, setAbaAtiva] = useState<AbaId>("demandas")
  const [subAbaFinanceiro, setSubAbaFinanceiro] = useState<SubAbaFinanceiro>("livro")

  async function carregarSessao() {
    const token = await getToken()
    if (!token) { setEstado({ fase: "deslogado" }); return }
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

  useEffect(() => { carregarSessao() }, [])

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

  if (estado.fase === "verificando") return <TelaCentral titulo="Gás Favero Motorista" subtitulo="Carregando..." />
  if (estado.fase === "deslogado") return <Login onSuccess={carregarSessao} />
  if (estado.fase === "erro") return <Login onSuccess={carregarSessao} />

  const { token, usuario } = estado

  return (
    <div style={estilos.shell}>
      <TopBar token={token} motoristaId={usuario.id} />

      <main style={estilos.conteudo}>
        {abaAtiva === "demandas" && (
          <MinhasDemandas token={token} meuId={usuario.id} aoConcluirChamado={() => setAbaAtiva("vendas")} />
        )}
        {abaAtiva === "vendas" && (
          <VendasTela token={token} usuario={usuario} />
        )}
        {abaAtiva === "financeiro" && (
          <>
            {/* Sub-navegação do módulo financeiro */}
            <SubNav aba={subAbaFinanceiro} onMudar={setSubAbaFinanceiro} />
            {subAbaFinanceiro === "livro" && (
              <FinanceiroTela token={token} usuario={usuario} />
            )}
            {subAbaFinanceiro === "fiado" && (
              <RecebimentoFiadoTela token={token} usuario={usuario} />
            )}
          </>
        )}
        {abaAtiva === "perfil" && (
          <PerfilTela usuario={usuario} onLogout={handleLogout} />
        )}
      </main>

      <BottomNav abaAtiva={abaAtiva} onMudarAba={setAbaAtiva} />
    </div>
  )
}

// Sub-navegação horizontal dentro do módulo Financeiro
function SubNav({
  aba,
  onMudar,
}: {
  aba: SubAbaFinanceiro
  onMudar: (a: SubAbaFinanceiro) => void
}) {
  const itens: { id: SubAbaFinanceiro; label: string }[] = [
    { id: "livro", label: "Livro de Vendas" },
    { id: "fiado", label: "Receber Fiado" },
  ]
  return (
    <div style={subNav.barra}>
      {itens.map(item => (
        <button
          key={item.id}
          style={{ ...subNav.btn, ...(aba === item.id ? subNav.ativo : {}) }}
          onClick={() => onMudar(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

const subNav = {
  barra: {
    display: "flex",
    background: "#f5f5f5",
    borderBottom: "1px solid #e5e7eb",
    padding: "8px 14px",
    gap: "8px",
  } as const,
  btn: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    padding: "6px 14px",
    fontSize: "13px",
    color: "#374151",
    cursor: "pointer",
    fontWeight: 400,
  } as const,
  ativo: {
    background: "#606C38",
    borderColor: "#606C38",
    color: "#F8FAFC",
    fontWeight: 600,
  } as const,
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
  shell: { minHeight: "100vh", background: CORES_APP.fundo },
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
    padding: "max(1.5rem, env(safe-area-inset-top)) max(1.5rem, env(safe-area-inset-right)) max(1.5rem, env(safe-area-inset-bottom)) max(1.5rem, env(safe-area-inset-left))",
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
