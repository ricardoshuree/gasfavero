// [mcp-local harness] feature: login-google-pkce | plano: ad32109c | 2026-08-07 14:01:05
// Troca fluxo OAuth de implicit para PKCE (mais robusto em mobile/tablet)
// [mcp-local harness] feature: close-open-signup-security | plano: ac575558 | 2026-08-04 11:30:25
// Remove comentario desatualizado de 'nao testado'
// Cliente Supabase para o frontend -- usado só para autenticação
// (login Google via OAuth). Toda a leitura/escrita de dados de negócio
// continua indo pelo backend FastAPI (client/ gerado do OpenAPI), não
// direto pelo Supabase.
//
// Precisa de VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env do
// frontend (mesmos valores públicos usados no backend, prefixados com
// VITE_ para o Vite expor no bundle do browser -- são seguros de expor,
// é a "publishable key").
//
// flowType: 'pkce' -- investigando relato do Ricardo de login Google
// falhando silenciosamente em alguns tablets/celulares (volta pro
// /login sem nenhuma mensagem de erro). O padrão do supabase-js pra
// SPA é o fluxo IMPLICIT: o token de acesso volta grudado no
// fragmento (#access_token=...) da URL, depois de Google → Supabase →
// nosso domínio -- se qualquer coisa nesse caminho não preservar esse
// fragmento (comum em Safari com proteção anti-rastreamento mais
// agressiva, e em geral menos robusto em mobile), a sessão nunca é
// criada e não sobra nenhum erro visível pra debugar, só o silêncio
// que o Ricardo descreveu.
//
// PKCE troca esse token por um código curto (?code=...) na URL,
// trocado depois por uma chamada HTTP direta (exchangeCodeForSession,
// disparada automaticamente pelo supabase-js com detectSessionInUrl
// ainda em true, sem precisar chamar nada manualmente) -- não depende
// do fragmento sobreviver ao redirecionamento inteiro. É o fluxo que
// o próprio Supabase recomenda pra esse cenário.
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não configurados -- login com Google não vai funcionar.",
  )
}

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "", {
  auth: {
    flowType: "pkce",
  },
})
