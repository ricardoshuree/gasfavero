// [mcp-local harness] feature: inadimplentes-frontend | plano: 0f595f3e | 2026-08-06 12:51:57
// 2 linhas (Ano/Mes), sem Semana -- controla o escopo ativo dos Inadimplentes
// Menu interativo dos Inadimplentes -- 2 linhas (Ano, Mês), SEM linha
// de Semana (diferente do LivroVendasMenu) -- só um "escopo" ativo
// por vez em toda a tela:
//
//   - Linha Ano: "todos os anos" (escopo=todos_anos) + até 5 anos mais
//     recentes com venda inadimplente (escopo=ano, ano=N)
//   - Linha Mês: "todos do ano" (escopo=ano, ano=contexto) + 12 meses
//     (escopo=mes, ano=contexto, mes=N) -- "contexto" é o ano
//     selecionado na linha de cima, ou o ano vigente se nada
//     específico estiver selecionado ali
import { cn } from "@/lib/utils"

export type InadimplentesEscopo = "todos_anos" | "ano" | "mes"

export interface InadimplentesSelecao {
  escopo: InadimplentesEscopo
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

interface InadimplentesMenuProps {
  anosDisponiveis: number[]
  selecao: InadimplentesSelecao
  onChange: (selecao: InadimplentesSelecao) => void
}

export function InadimplentesMenu({
  anosDisponiveis,
  selecao,
  onChange,
}: InadimplentesMenuProps) {
  const hoje = new Date()
  const anoVigente = hoje.getFullYear()

  // Ano "em contexto" pra linha de Mês: o ano explicitamente
  // selecionado na linha de cima, ou o vigente se nada específico
  // estiver selecionado (escopo todos_anos).
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
    </div>
  )
}

export default InadimplentesMenu
