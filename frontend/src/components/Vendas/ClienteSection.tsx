// [mcp-local harness] feature: fluxo-vendas-distribuidora-frontend | plano: b8adcd52 | 2026-08-05 10:45:13
// Corrige tipagem do onError (ApiError explicito)
// [mcp-local harness] feature: fluxo-vendas-distribuidora-frontend | plano: b8adcd52
// Secao de cliente: busca, selecao, quick-add com endereco opcional, sugestao de ultimo endereco transacionado
//
// [mcp-local harness] fix: onError tipado como ApiError (nao unknown)
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { MapPin, Plus, Search, User, X } from "lucide-react"
import { useEffect, useState } from "react"

import {
  type ApiError,
  type ClienteCreate,
  type ClientePublic,
  ClientesService,
  type EnderecoPublic,
  GeografiaService,
  VendasService,
} from "@/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

interface ClienteSectionProps {
  cliente: ClientePublic | null
  onClienteChange: (cliente: ClientePublic | null) => void
  enderecoSelecionado: EnderecoPublic | null
  onEnderecoChange: (endereco: EnderecoPublic | null) => void
}

function formatEndereco(e: EnderecoPublic): string {
  return `${e.rua_nome}, ${e.numero}${e.complemento ? ` (${e.complemento})` : ""} — ${e.bairro_nome}`
}

export function ClienteSection({
  cliente,
  onClienteChange,
  enderecoSelecionado,
  onEnderecoChange,
}: ClienteSectionProps) {
  const [query, setQuery] = useState("")
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const queryClient = useQueryClient()

  const { data: resultados } = useQuery({
    queryKey: ["clientes-busca-venda", query],
    queryFn: () => ClientesService.readClientes({ q: query, limit: 8 }),
    enabled: query.trim().length >= 2 && !cliente,
  })

  // Ao selecionar um cliente, busca o endereço da venda mais recente
  // dele (sugestão) -- se não tiver histórico de venda, cai pro
  // endereço vigente do cadastro.
  useEffect(() => {
    if (!cliente) {
      onEnderecoChange(null)
      return
    }
    let cancelado = false
    VendasService.readUltimoEnderecoCliente({ clienteId: cliente.id })
      .then((endereco) => {
        if (cancelado) return
        onEnderecoChange(endereco ?? cliente.endereco ?? null)
      })
      .catch(() => {
        if (!cancelado) onEnderecoChange(cliente.endereco ?? null)
      })
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente?.id])

  if (cliente) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-semibold">{cliente.nome}</p>
              <p className="text-sm text-muted-foreground">
                {cliente.cpf}
                {cliente.telefone ? ` · ${cliente.telefone}` : ""}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onClienteChange(null)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
          {enderecoSelecionado ? (
            <>
              <span className="flex-1">{formatEndereco(enderecoSelecionado)}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onEnderecoChange(null)}
              >
                Remover
              </Button>
            </>
          ) : (
            <span className="text-muted-foreground">
              Sem endereço nessa venda (opcional)
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {!showQuickAdd ? (
        <>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Buscar cliente por nome ou CPF..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {resultados && resultados.data.length > 0 && (
            <div className="flex flex-col gap-1 rounded-lg border p-1">
              {resultados.data.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    onClienteChange(c)
                    setQuery("")
                  }}
                >
                  <span className="font-medium">{c.nome}</span>{" "}
                  <span className="text-muted-foreground">— {c.cpf}</span>
                </button>
              ))}
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={() => setShowQuickAdd(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo Cliente
          </Button>
        </>
      ) : (
        <QuickAddCliente
          onCancel={() => setShowQuickAdd(false)}
          onCreated={(novoCliente) => {
            showSuccessToast("Cliente cadastrado com sucesso")
            queryClient.invalidateQueries({ queryKey: ["clientes"] })
            onClienteChange(novoCliente)
            setShowQuickAdd(false)
          }}
          onError={(err) => handleError.call(showErrorToast, err)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cadastro rápido de cliente -- endereço é OPCIONAL aqui (diferente da
// tela /clientes, onde é obrigatório). Decisão do Ricardo.
// ---------------------------------------------------------------------------

interface QuickAddClienteProps {
  onCancel: () => void
  onCreated: (cliente: ClientePublic) => void
  onError: (error: ApiError) => void
}

function QuickAddCliente({ onCancel, onCreated, onError }: QuickAddClienteProps) {
  const [nome, setNome] = useState("")
  const [cpf, setCpf] = useState("")
  const [telefone, setTelefone] = useState("")
  const [incluirEndereco, setIncluirEndereco] = useState(false)
  const [bairroId, setBairroId] = useState("")
  const [ruaNome, setRuaNome] = useState("")
  const [numero, setNumero] = useState("")

  const { data: bairros } = useQuery({
    queryKey: ["bairros"],
    queryFn: () => GeografiaService.readBairros(),
    enabled: incluirEndereco,
  })
  const { data: ruas } = useQuery({
    queryKey: ["ruas", bairroId],
    queryFn: () => GeografiaService.readRuas({ bairroId }),
    enabled: incluirEndereco && !!bairroId,
  })

  const mutation = useMutation({
    mutationFn: (data: ClienteCreate) =>
      ClientesService.createCliente({ requestBody: data }),
    onSuccess: onCreated,
    onError,
  })

  const podeSalvar = nome.trim().length > 0 && cpf.trim().length >= 11

  const onSubmit = () => {
    mutation.mutate({
      nome,
      cpf,
      telefone: telefone || undefined,
      endereco:
        incluirEndereco && bairroId && ruaNome && numero
          ? { bairro_id: bairroId, rua_nome: ruaNome, numero }
          : undefined,
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="grid gap-1.5">
        <Label htmlFor="qc-nome">
          Nome <span className="text-destructive">*</span>
        </Label>
        <Input id="qc-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="qc-cpf">
            CPF <span className="text-destructive">*</span>
          </Label>
          <Input
            id="qc-cpf"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="qc-telefone">Telefone</Label>
          <Input
            id="qc-telefone"
            placeholder="(00) 00000-0000"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
          />
        </div>
      </div>

      {!incluirEndereco ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit"
          onClick={() => setIncluirEndereco(true)}
        >
          <Plus className="mr-1 h-3 w-3" />
          Adicionar endereço (opcional)
        </Button>
      ) : (
        <div className="grid gap-3 rounded-md bg-muted/40 p-2">
          <div className="grid gap-1.5">
            <Label>Bairro</Label>
            <Select
              value={bairroId}
              onValueChange={(v) => {
                setBairroId(v)
                setRuaNome("")
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione o bairro" />
              </SelectTrigger>
              <SelectContent>
                {bairros?.data.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="qc-rua">Rua</Label>
            <Input
              id="qc-rua"
              list="qc-ruas-sugeridas"
              disabled={!bairroId}
              value={ruaNome}
              onChange={(e) => setRuaNome(e.target.value)}
            />
            <datalist id="qc-ruas-sugeridas">
              {ruas?.data.map((r) => (
                <option key={r.id} value={r.nome} />
              ))}
            </datalist>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="qc-numero">Número</Label>
            <Input
              id="qc-numero"
              placeholder="123 ou s/n"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={!podeSalvar || mutation.isPending}
          onClick={onSubmit}
        >
          Salvar Cliente
        </Button>
      </div>
    </div>
  )
}

export default ClienteSection
