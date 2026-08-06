// [mcp-local harness] feature: livro-vendas-frontend-menu | plano: a149353c | 2026-08-06 09:35:34
// 3 linhas mutuamente exclusivas (Ano/Mes/Semana) que controlam o escopo ativo do Livro de Vendas
// Menu interativo do Livro de Vendas -- 3 linhas (Ano, Mês, Semana),
// só um "escopo" ativo por vez em toda a tela:
//
//   - Linha Ano: "todos os anos" (escopo=todos_anos) + até 5 anos mais
//     recentes com venda (escopo=ano, ano=N)
//   - Linha Mês: "todos do ano" (escopo=ano, ano=contexto) + 12 meses
//     (escopo=mes, ano=contexto, mes=N) -- "contexto" é o ano
//     selecionado na linha de cima, ou o ano vigente se nada
//     específico estiver selecionado ali
//   - Linha Semana: "todas as semanas" (escopo=mes, sempre com o
//     ano/mês VIGENTE, não o contexto) + "Semana" (escopo=semana,
//     semana corrente) -- atalho independente que sempre pula pro
//     "agora", ignorando qualquer seleção de Ano/Mês feita antes
import { cn } from "@/lib/utils"

export type LivroEscopo = "todos_anos" | "ano" | "mes" | "semana"

export interface LivroSelecao {
  escopo: LivroEscopo
  ano?: number
  mes?: number
}

const MESES = [
  { n: 1, label: "Jan" },
  { n: 2, label: "Fev" },
  { n: 3, label: "Mar" },
  { n: 4, label: "Abr" },
  { n: 5, label: "Mai" },
  { n: 6, label: "Jun" },
  { n: 7, label: "Jul" },
  { n: 8, label: "Ago" },
  { n: 9, label: "Set" },
  { n: 10, label: "Out" },
  { n: 11, label: "Nov" },
  { n: 12, label: "Dez" },
]

interface MenuButtonProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}

function MenuButton({ active, onClick, children }: MenuButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      {children}
    </button>
  )
}

interface LivroVendasMenuProps {
  anosDisponiveis: number[]
  selecao: LivroSelecao
  onChange: (selecao: LivroSelecao) => void
}

export function LivroVendasMenu({
  anosDisponiveis,
  selecao,
  onChange,
}: LivroVendasMenuProps) {
  const hoje = new Date()
  const anoVigente = hoje.getFullYear()
  const mesVigente = hoje.getMonth() + 1

  // Ano "em contexto" pra linha de Mês: o ano explicitamente
  // selecionado na linha de cima (escopo ano/mes), ou o vigente se
  // nada específico estiver selecionado (escopo todos_anos/semana).
  const anoContexto =
    (selecao.escopo === "ano" || selecao.escopo === "mes") && selecao.ano
      ? selecao.ano
      : anoVigente

  return (
    <div className="flex flex-col gap-2">
      {/* Linha Ano */}
      <div className="flex flex-wrap items-center gap-2">
        <MenuButton
          active={selecao.escopo === "todos_anos"}
          onClick={() => onChange({ escopo: "todos_anos" })}
        >
          Todos os anos
        </MenuButton>
        {anosDisponiveis.map((ano) => (
          <MenuButton
            key={ano}
            active={selecao.escopo === "ano" && selecao.ano === ano}
            onClick={() => onChange({ escopo: "ano", ano })}
          >
            {ano}
          </MenuButton>
        ))}
      </div>

      {/* Linha Mês -- sempre dentro do anoContexto */}
      <div className="flex flex-wrap items-center gap-2">
        <MenuButton
          active={selecao.escopo === "ano" && selecao.ano === anoContexto}
          onClick={() => onChange({ escopo: "ano", ano: anoContexto })}
        >
          Todos do ano
        </MenuButton>
        {MESES.map((m) => (
          <MenuButton
            key={m.n}
            active={
              selecao.escopo === "mes" &&
              selecao.ano === anoContexto &&
              selecao.mes === m.n
            }
            onClick={() =>
              onChange({ escopo: "mes", ano: anoContexto, mes: m.n })
            }
          >
            {m.label}
          </MenuButton>
        ))}
      </div>

      {/* Linha Semana -- atalho independente, sempre pro "agora" */}
      <div className="flex flex-wrap items-center gap-2">
        <MenuButton
          active={
            selecao.escopo === "mes" &&
            selecao.ano === anoVigente &&
            selecao.mes === mesVigente
          }
          onClick={() =>
            onChange({ escopo: "mes", ano: anoVigente, mes: mesVigente })
          }
        >
          Todas as semanas
        </MenuButton>
        <MenuButton
          active={selecao.escopo === "semana"}
          onClick={() => onChange({ escopo: "semana" })}
        >
          Semana
        </MenuButton>
      </div>
    </div>
  )
}

export default LivroVendasMenu
