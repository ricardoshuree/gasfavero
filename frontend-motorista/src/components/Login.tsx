// [mcp-local harness] feature: frontend-motorista-redesign-ifood | plano: 46dc14df | 2026-08-07 19:18:45
// So troca o import para CORES_LOGIN (alias CORES) -- resto do arquivo identico, Login mantem a paleta escura
import { type CSSProperties, type FormEvent, useState } from "react"
import { login } from "../lib/auth"
import { CORES_LOGIN as CORES } from "../theme"

const estilos: Record<string, CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.75rem",
    padding:
      "max(1.5rem, env(safe-area-inset-top)) max(1.5rem, env(safe-area-inset-right)) max(1.5rem, env(safe-area-inset-bottom)) max(1.5rem, env(safe-area-inset-left))",
    textAlign: "center",
    fontFamily: "system-ui, sans-serif",
    background: CORES.fundo,
    color: CORES.texto,
    boxSizing: "border-box",
  },
  titulo: { fontSize: "1.5rem", fontWeight: 700, margin: "0 0 0.5rem", color: CORES.texto },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    width: "100%",
    maxWidth: "320px",
    textAlign: "left",
  },
  label: { fontSize: "0.875rem", color: CORES.texto, marginTop: "0.5rem" },
  input: {
    padding: "0.75rem",
    borderRadius: "0.5rem",
    border: `1px solid ${CORES.campoBorda}`,
    background: CORES.campo,
    color: CORES.campoTexto,
    fontSize: "1rem",
    boxSizing: "border-box",
  },
  erro: { color: CORES.erro, fontSize: "0.875rem", margin: "0.25rem 0 0" },
  botao: {
    marginTop: "0.75rem",
    padding: "0.85rem",
    borderRadius: "0.5rem",
    border: "none",
    background: CORES.botao,
    color: CORES.botaoTexto,
    fontWeight: 700,
    fontSize: "1rem",
  },
}

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("")
  const [senha, setSenha] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setCarregando(true)
    try {
      await login(email, senha)
      onSuccess()
    } catch {
      // Mensagem genérica de propósito -- não expor se foi email
      // inexistente vs senha errada (mesmo padrão de segurança do
      // login web).
      setErro("Email ou senha inválidos.")
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div style={estilos.container}>
      <h1 style={estilos.titulo}>Gás Favero Motorista</h1>

      <form onSubmit={handleSubmit} style={estilos.form}>
        <label style={estilos.label} htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={estilos.input}
          required
        />

        <label style={estilos.label} htmlFor="senha">
          Senha
        </label>
        <input
          id="senha"
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          style={estilos.input}
          required
        />

        {erro && <p style={estilos.erro}>{erro}</p>}

        <button type="submit" style={estilos.botao} disabled={carregando}>
          {carregando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  )
}

export default Login
