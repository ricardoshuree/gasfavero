// [mcp-local harness] feature: frontend-motorista-login | plano: 8f6497c0 | 2026-08-07 17:18:03
// Cliente HTTP minimo (fetch puro, sem gerador OpenAPI) apontando pra API_URL do .env
// Cliente HTTP minimo do app do motorista -- sem gerador OpenAPI por
// enquanto (o frontend principal usa @hey-api/openapi-ts, mas esse
// app e proposital enxuto; se crescer, pode passar a gerar client
// tambem). Backend sempre em producao (Railway), ver .env.
const API_URL = import.meta.env.VITE_API_URL

if (!API_URL) {
  throw new Error("VITE_API_URL nao configurado (ver .env)")
}

class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = options

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  })

  if (!res.ok) {
    // Backend FastAPI sempre devolve {"detail": "..."} em erro
    const body = await res.json().catch(() => null)
    const detail =
      typeof body?.detail === "string" ? body.detail : `Erro ${res.status}`
    throw new ApiError(res.status, detail)
  }

  // 204/sem corpo -- alguns endpoints podem nao retornar JSON
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export { API_URL, ApiError, request }
