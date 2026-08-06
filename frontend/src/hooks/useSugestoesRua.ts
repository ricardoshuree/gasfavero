// [mcp-local harness] feature: logradouros-referencia-autocomplete | plano: 9f8f68f9 | 2026-08-06 15:46:14
// Hook que mescla ruas do bairro com o catalogo de referencia, dedupe por nome
// Hook compartilhado pelos 4 formulários que usam RuaAutocomplete
// (AddCliente, TrocarEndereco, TrocarEnderecoDialog, QuickAddCliente
// em Vendas/ClienteSection) -- mescla duas fontes de sugestão:
//
//   1) Ruas já cadastradas NESSE bairro (GET /bairros/{id}/ruas) --
//      "cresce por uso", tem prioridade (usa o id real da Rua).
//   2) Catálogo de referência da cidade inteira, sem bairro (GET
//      /bairros/logradouros-referencia, ~239 nomes) -- usado como
//      fonte extra, já que a maioria dos bairros ainda não tem
//      nenhuma rua cadastrada organicamente. Ver comentário em
//      LogradouroReferencia (models.py) sobre por que não tem bairro
//      associado ainda (Google Maps e Correios não deram resultado
//      confiável pra Veranópolis).
//
// Dedupe por nome (case-insensitive) -- se o mesmo nome já existe nas
// duas listas, mantém só a versão de `ruas` (id real). O campo
// continua texto livre (RuaAutocomplete não força selecionar um item
// da lista).
import { useQuery } from "@tanstack/react-query"

import { GeografiaService } from "@/client"

interface RuaOption {
  id: string
  nome: string
}

export function useSugestoesRua(bairroId: string | undefined): {
  opcoes: RuaOption[]
} {
  const { data: ruas } = useQuery({
    queryKey: ["ruas", bairroId],
    queryFn: () => GeografiaService.readRuas({ bairroId: bairroId as string }),
    enabled: !!bairroId,
  })

  // Catálogo de referência não depende do bairro -- busca 1 vez só,
  // reaproveitada (cache) em qualquer formulário de endereço da tela.
  const { data: referencia } = useQuery({
    queryKey: ["logradourosReferencia"],
    queryFn: () => GeografiaService.readLogradourosReferencia(),
    staleTime: 1000 * 60 * 30,
  })

  const nomesJaCadastrados = new Set(
    (ruas?.data ?? []).map((r) => r.nome.toLowerCase()),
  )
  const referenciaSemDuplicata = (referencia?.data ?? []).filter(
    (r) => !nomesJaCadastrados.has(r.nome.toLowerCase()),
  )

  return {
    opcoes: [...(ruas?.data ?? []), ...referenciaSemDuplicata],
  }
}

export default useSugestoesRua
