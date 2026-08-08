// [mcp-local harness] feature: acessibilidade-cliente-endereco | plano: c4a2bd6c | 2026-08-08 13:13:09
// Adiciona prop className repassada pro Input interno + sugestoes maiores (py-2.5, text-base)
// Autocomplete customizado pra Rua, reutilizavel
// Substitui o <datalist> nativo do navegador (inconsistente entre
// navegadores/mobile) por um dropdown de verdade, no mesmo estilo da
// busca de Cliente. Continua texto livre: nao forca selecionar um
// item da lista (ver EnderecoCreate.rua_nome, "cresce por uso").
import { useState } from "react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface RuaOption {
  id: string
  nome: string
}

interface RuaAutocompleteProps {
  id?: string
  value: string
  onChange: (value: string) => void
  opcoes: RuaOption[] | undefined
  disabled?: boolean
  placeholder?: string
  /** Repassado pro <Input> interno -- ver comentário de
   * acessibilidade em ClienteSection.tsx (campos maiores, pra quem
   * tem dificuldade de visão). */
  className?: string
}

export function RuaAutocomplete({
  id,
  value,
  onChange,
  opcoes,
  disabled,
  placeholder = "Nome da rua",
  className,
}: RuaAutocompleteProps) {
  const [open, setOpen] = useState(false)

  const sugestoes = (opcoes ?? []).filter((r) =>
    r.nome.toLowerCase().includes(value.trim().toLowerCase()),
  )
  const mostrarSugestoes =
    open && value.trim().length > 0 && sugestoes.length > 0

  return (
    <div className="relative">
      <Input
        id={id}
        type="text"
        placeholder={placeholder}
        disabled={disabled}
        value={value}
        autoComplete="off"
        className={className}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        // pequeno delay pra permitir o onClick da sugestão disparar
        // antes do blur fechar a lista
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {mostrarSugestoes && (
        <div
          className={cn(
            "absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md",
          )}
        >
          {sugestoes.map((rua) => (
            <button
              key={rua.id}
              type="button"
              className="block w-full rounded-sm px-3 py-2.5 text-left text-base hover:bg-muted"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(rua.nome)
                setOpen(false)
              }}
            >
              {rua.nome}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default RuaAutocomplete
