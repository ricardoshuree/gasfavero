// [mcp-local harness] feature: fcm-fix-registro-pos-login | plano: aca5f641 | 2026-08-09 18:53:49
// Chama window.AndroidFCM.sincronizar() apos persistir motorista_id no login
// [mcp-local harness] feature: fcm-fix-registro-pos-login | plano: aca5f641 | 2026-08-09
// Chama window.AndroidFCM.sincronizar() apos persistir motorista_id -- forca o nativo a tentar registrar o token de novo agora que a sessao existe (onNewToken() sozinho nao cobre o caso "token gerado antes do login")
// [mcp-local harness] feature: fcm-android-nativo | plano: 6356739b | 2026-08-09
// Persiste motorista_id nas Preferences (mesmo storage do access_token) -- ponte pro service nativo de push registrar o token sem precisar de plugin novo
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

// Chave usada tanto aqui quanto pelo service nativo de push
// (MotoristaFirebaseMessagingService.java / FcmTokenRegistrar.java,
// PREFS_NOME/CHAVE_MOTORISTA_ID) -- ver comentário completo lá.
// Mantida como constante nos dois lugares (não dá pra compartilhar
// literalmente entre Java e TS), então qualquer mudança de nome
// precisa ser feita nos dois arquivos ao mesmo tempo.
const MOTORISTA_ID_KEY = "motorista_id"

// Ponte JS -> nativo (Android) exposta por MainActivity via
// WebView.addJavascriptInterface -- ver comentário completo lá.
// Inexistente no browser (dev via `npm run dev`) e no iOS (não temos
// build iOS) -- por isso sempre acessado com `?.`, nunca chamado
// direto. Ausência silenciosa é o comportamento correto nesses
// ambientes, não um erro.
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
      // Persiste o motorista_id nas Preferences (mesmo storage
      // nativo do access_token) -- é a partir daqui que o service
      // nativo de push (Fase 4, sessão 09/08) consegue montar a
      // chamada de registro de token FCM sem precisar de um plugin
      // Capacitor customizado. Ver MotoristaFirebaseMessagingService.java.
      await Preferences.set({ key: MOTORISTA_ID_KEY, value: usuario.id })

      // Força uma nova tentativa de registro do token FCM AGORA que
      // a sessão existe -- bug real encontrado testando nesta sessão
      // (09/08): o token normalmente já é gerado pelo Firebase assim
      // que o app abre pela primeira vez, ANTES do motorista
      // terminar o login. Nesse momento o onNewToken() nativo dispara
      // mas não encontra sessão salva ainda, e como o token não
      // rotaciona com frequência, o registro podia nunca mais ser
      // tentado (motorista ficaria sem push por semanas, sem erro
      // nenhum visível). Ver MainActivity.java / FcmTokenRegistrar.java.
      ;(window as JanelaComPonteAndroid).AndroidFCM?.sincronizar?.()
    } catch {
      // Token invalido/expirado -- limpa e volta pro login, sem
      // travar o usuario numa tela de erro
      await logout()
      setEstado({ fase: "deslogado" })
    }
  }

  useEffect(() => {
    carregarSessao()
  }, [])

  // Desbloqueia o áudio do alarme na PRIMEIRA interação do usuário
  // com o app inteiro (qualquer toque) -- navegador/WebView suspende
  // o AudioContext até um gesto do usuário; sem isso, o alarme
  // disparado depois pelo polling em segundo plano tocava mudo, sem
  // erro nenhum. Ouve só uma vez (capture + remove) e não interfere
  // em nada do resto do app.
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
    // Estado declarado no tipo mas ainda sem produtor real (nenhum
    // fluxo atual seta "erro" -- reservado pra quando handleLogout
    // ou carregarSessao precisarem distinguir falha de rede de
    // deslogado de verdade). Fallback seguro: volta pro login.
    return <Login onSuccess={carregarSessao} />
  }

  // A partir daqui TS sabe que estado.fase === "logado" (união
  // exaustiva) -- estado.token e estado.usuario existem com
  // segurança.
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
        {abaAtiva === "vendas" && <VendasTela />}
        {abaAtiva === "financeiro" && <FinanceiroTela />}
        {abaAtiva === "perfil" && <PerfilTela usuario={usuario} onLogout={handleLogout} />}
      </main>

      <BottomNav abaAtiva={abaAtiva} onMudarAba={setAbaAtiva} />
    </div>
  )
}

function TelaCentral({ titulo, subtitulo }: { titulo: string; subtitulo: string }) {
  // Splash pré-autenticação -- usa a paleta do Login de propósito
  // (é o primeiro momento visual do app, antes de sabermos se vai
  // cair no Login escuro ou no app claro estilo iFood).
  return (
    <div style={estilos.splash}>
      <h1 style={estilos.splashTitulo}>{titulo}</h1>
      <p style={estilos.splashSubtitulo}>{subtitulo}</p>
    </div>
  )
}

const estilos = {
  // App logado -- paleta clara estilo iFood (CORES_APP).
  shell: {
    minHeight: "100vh",
    background: CORES_APP.fundo,
  },
  // Espaço reservado pra TopBar (fixa, topo) e BottomNav (fixa,
  // rodapé) não cobrirem o conteúdo rolável do meio.
  conteudo: {
    paddingTop: `calc(${ALTURA_TOPBAR_PX}px + env(safe-area-inset-top))`,
    paddingBottom: `calc(${ALTURA_BOTTOMNAV_PX}px + env(safe-area-inset-bottom))`,
    minHeight: "100vh",
    boxSizing: "border-box" as const,
  },
  // Splash -- paleta escura do Login (CORES_LOGIN).
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
