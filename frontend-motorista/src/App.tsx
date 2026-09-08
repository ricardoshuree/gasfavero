// [mcp-local harness] feature: fix-cosmetico-livro-vendas | plano: d1f3d354 | 2026-09-08 12:19:22
// App.tsx: botão voltar estilo iFood, espaço reduzido no cabeçalho, financeiro volta ao hub ao clicar na aba ativa
// App.tsx — navegação principal
// Botão voltar estilo iFood (bolinha cinza com < dentro)
// Clicar em Financeiro quando já está numa sub-tela volta ao hub
import { Preferences } from "@capacitor/preferences"
import { useEffect, useState } from "react"
import BottomNav, { ALTURA_BOTTOMNAV_PX, type AbaId } from "./components/BottomNav"
import DevolucaoCascosTela from "./components/DevolucaoCascosTela"
import FinanceiroHub, { type SubTelaFinanceiro } from "./components/FinanceiroHub"
import FinanceiroTela from "./components/FinanceiroTela"
import InadimplentesTola from "./components/InadimplentesTola"
import Login from "./components/Login"
import MaloteTela from "./components/MaloteTela"
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

const MOTORISTA_ID_KEY = "motorista_id"

type JanelaComPonteAndroid = Window & {
  AndroidFCM?: { sincronizar?: () => void }
}

const SUBTELA_TITULO: Record<SubTelaFinanceiro, string> = {
  livro:            "Livro de Vendas",
  recebimento_vale: "Recebimento de Fiado",
  inadimplentes:    "Inadimplentes",
  malote:           "Malote Motorista",
  cascos:           "Devolução de Cascos",
}

function App() {
  const [estado, setEstado] = useState<Estado>({ fase: "verificando" })
  const [abaAtiva, setAbaAtiva] = useState<AbaId>("demandas")
  const [subTelaFinanceiro, setSubTelaFinanceiro] = useState<SubTelaFinanceiro | null>(null)

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

  function handleMudarAba(aba: AbaId) {
    if (aba === "financeiro") {
      // Se já está no financeiro: volta ao hub (reseta sub-tela)
      // Se estava em outra aba: abre financeiro no hub
      setSubTelaFinanceiro(null)
    }
    setAbaAtiva(aba)
  }

  async function handleLogout() {
    await logout()
    setAbaAtiva("demandas")
    setSubTelaFinanceiro(null)
    setEstado({ fase: "deslogado" })
  }

  if (estado.fase === "verificando") return <TelaCentral titulo="Gás Favero Motorista" subtitulo="Carregando..." />
  if (estado.fase === "deslogado")   return <Login onSuccess={carregarSessao} />
  if (estado.fase === "erro")        return <Login onSuccess={carregarSessao} />

  const { token, usuario } = estado

  function renderFinanceiro() {
    if (!subTelaFinanceiro) {
      return <FinanceiroHub onNavegar={setSubTelaFinanceiro} />
    }

    const cabecalho = (
      <div style={estilos.subCabecalho}>
        {/* Botão voltar estilo iFood — bolinha cinza com < */}
        <button style={estilos.btnVoltar} onClick={() => setSubTelaFinanceiro(null)}>
          ‹
        </button>
        <span style={estilos.subTitulo}>{SUBTELA_TITULO[subTelaFinanceiro]}</span>
        <div style={{ width: "36px" }} />
      </div>
    )

    if (subTelaFinanceiro === "livro")            return <>{cabecalho}<FinanceiroTela token={token} usuario={usuario} /></>
    if (subTelaFinanceiro === "recebimento_vale") return <>{cabecalho}<RecebimentoFiadoTela token={token} usuario={usuario} /></>
    if (subTelaFinanceiro === "inadimplentes")    return <>{cabecalho}<InadimplentesTola token={token} usuario={usuario} /></>
    if (subTelaFinanceiro === "malote")           return <>{cabecalho}<MaloteTela token={token} usuario={usuario} /></>
    if (subTelaFinanceiro === "cascos")           return <>{cabecalho}<DevolucaoCascosTela token={token} usuario={usuario} /></>
    return null
  }

  return (
    <div style={estilos.shell}>
      <TopBar token={token} motoristaId={usuario.id} nomeMotorista={usuario.full_name ?? usuario.email} />
      <main style={estilos.conteudo}>
        {abaAtiva === "demandas" && (
          <MinhasDemandas token={token} meuId={usuario.id} aoConcluirChamado={() => handleMudarAba("vendas")} />
        )}
        {abaAtiva === "vendas" && <VendasTela token={token} usuario={usuario} />}
        {abaAtiva === "financeiro" && renderFinanceiro()}
        {abaAtiva === "perfil" && (
          <PerfilTela usuario={usuario} token={token} onLogout={handleLogout} />
        )}
      </main>
      <BottomNav abaAtiva={abaAtiva} onMudarAba={handleMudarAba} />
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
  shell: { minHeight: "100vh", background: CORES_APP.fundo },
  conteudo: {
    paddingTop: `calc(${ALTURA_TOPBAR_PX}px + env(safe-area-inset-top))`,
    paddingBottom: `calc(${ALTURA_BOTTOMNAV_PX}px + env(safe-area-inset-bottom))`,
    minHeight: "100vh", boxSizing: "border-box" as const,
  },
  subCabecalho: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "6px 12px 6px",  // reduzido — menos espaço vazio no topo
    background: "#fff", borderBottom: "1px solid #F3F4F6",
  } as const,
  // Botão voltar estilo iFood: bolinha cinza clara com ‹ grande
  btnVoltar: {
    width: "36px", height: "36px", borderRadius: "50%",
    background: "#F3F4F6", border: "none",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "22px", fontWeight: 700, color: "#111111",
    cursor: "pointer", lineHeight: 1, flexShrink: 0,
    paddingBottom: "2px",  // ajuste ótico do ‹
  } as const,
  subTitulo: {
    fontSize: "15px", fontWeight: 700, color: CORES_APP.texto,
    flex: 1, textAlign: "center" as const,
  },
  splash: {
    minHeight: "100vh", display: "flex", flexDirection: "column" as const,
    alignItems: "center", justifyContent: "center", gap: "0.75rem",
    padding: "max(1.5rem, env(safe-area-inset-top)) max(1.5rem, env(safe-area-inset-right)) max(1.5rem, env(safe-area-inset-bottom)) max(1.5rem, env(safe-area-inset-left))",
    textAlign: "center" as const, fontFamily: "system-ui, sans-serif",
    background: CORES_LOGIN.fundo, color: CORES_LOGIN.texto, boxSizing: "border-box" as const,
  },
  splashTitulo:    { fontSize: "1.5rem", fontWeight: 700, color: CORES_LOGIN.texto },
  splashSubtitulo: { color: CORES_LOGIN.texto, opacity: 0.75 },
}

export default App
