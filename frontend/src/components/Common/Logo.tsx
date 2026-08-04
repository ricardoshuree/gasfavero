// [mcp-local harness] feature: fix-missing-logo-assets | plano: f8c29d07 | 2026-08-04 01:09:48
// Logo.tsx com wordmark de texto, sem dependencia de assets SVG ausentes
import { Link } from "@tanstack/react-router"

import { cn } from "@/lib/utils"

// PLACEHOLDER: o template original (fastapi/full-stack-fastapi-template)
// referenciava 4 arquivos SVG em /assets/images/ que nunca foram
// commitados neste repositorio (frontend/public/ nao existe no repo
// inteiro) -- o build de producao (vite build) falha em import
// nao resolvido, diferente do vite dev que so teria mostrado a imagem
// quebrada silenciosamente. Trocado por um wordmark de texto simples
// ate ter a marca real do Gas Favero. Quando tiver os arquivos de
// logo definitivos, colocar em frontend/public/assets/images/ e
// trocar o conteudo deste componente para <img src="/assets/images/..." />
// como estava antes.
interface LogoProps {
  variant?: "full" | "icon" | "responsive"
  className?: string
  asLink?: boolean
}

export function Logo({
  variant = "full",
  className,
  asLink = true,
}: LogoProps) {
  const content =
    variant === "icon" ? (
      <span
        className={cn(
          "flex size-5 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground",
          className,
        )}
      >
        G
      </span>
    ) : (
      <span
        className={cn(
          "text-lg font-bold tracking-tight",
          variant === "responsive" &&
            "group-data-[collapsible=icon]:hidden",
          className,
        )}
      >
        gasfavero
      </span>
    )

  if (!asLink) {
    return content
  }

  return <Link to="/">{content}</Link>
}
