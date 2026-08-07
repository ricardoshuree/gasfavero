// [mcp-local harness] feature: frontend-motorista-login | plano: 8f6497c0 | 2026-08-07 17:18:16
// Login/logout/token via @capacitor/preferences, mesmo contrato do backend (POST /login/access-token form-urlencoded)
import { Preferences } from "@capacitor/preferences"
import { API_URL, ApiError, request } from "./api"

// Preferences (Capacitor) em vez de localStorage puro: persiste de
// forma mais confiavel dentro do WebView nativo entre aberturas do
// app -- localStorage de WebView pode ser limpo pelo sistema em
// cenarios de pouca memoria, Preferences usa armazenamento nativo
// (SharedPreferences no Android).
const TOKEN_KEY = "access_token"

type LoginResponse = {
  access_token: string
  token_type: string
}

// Mesmo contrato do frontend principal (LoginService.loginAccessToken):
// POST /api/v1/login/access-token, form-urlencoded, campos
// username/password (OAuth2PasswordRequestForm do FastAPI).
async function login(email: string, password: string): Promise<void> {
  const body = new URLSearchParams()
  body.set("username", email)
  body.set("password", password)

  const res = await fetch(`${API_URL}/api/v1/login/access-token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    const detail =
      typeof data?.detail === "string" ? data.detail : "Falha no login"
    throw new ApiError(res.status, detail)
  }

  const data: LoginResponse = await res.json()
  await Preferences.set({ key: TOKEN_KEY, value: data.access_token })
}

async function getToken(): Promise<string | null> {
  const { value } = await Preferences.get({ key: TOKEN_KEY })
  return value
}

async function logout(): Promise<void> {
  await Preferences.remove({ key: TOKEN_KEY })
}

type UserMe = {
  id: string
  email: string
  full_name: string | null
  is_superuser: boolean
}

async function fetchCurrentUser(token: string): Promise<UserMe> {
  return request<UserMe>("/api/v1/users/me", { token })
}

export { login, getToken, logout, fetchCurrentUser }
export type { UserMe }
