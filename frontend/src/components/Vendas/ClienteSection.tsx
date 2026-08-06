// [mcp-local harness] feature: logradouros-referencia-autocomplete | plano: f032de2c | 2026-08-06 15:48:51
// Substitui useQuery(ruas) por useSugestoesRua em QuickAddCliente
// [mcp-local harness] feature: logradouros-referencia-autocomplete
// QuickAddCliente: troca useQuery(ruas) local por useSugestoesRua
//
// [mcp-local harness] feature: cores-status-solido | plano: 8740e5ce | 2026-08-06 06:29:16
// Fundo solido vermelho/verde com letra branca (em vez de fundo claro + letra colorida)
// [mcp-local harness] feature: cores-status-solido | plano: 8740e5ce
// Fundo solido (vermelho/verde) + letra branca, em vez de fundo claro
// com letra colorida
// [mcp-local harness] feature: cores-status-historico | plano: ea3ad35c
// Cores dos badges: Em aberto/Em atraso em vermelho, Pago/Baixado em verde
// (Aguardando baixa continua azul -- nao foi pedido pra mudar)
// [mcp-local harness] feature: historico-vendas-cliente | plano: 92fde977 | 2026-08-06 06:05:38
// Adiciona bloco Historico de vendas (ultimas 3) no painel de cliente, pedido do Giovani
// [mcp-local harness] feature: historico-vendas-cliente | plano: 92fde977
// Bloco "Histórico de vendas (últimas 3)" no painel de cliente -- pedido do
// Giovani: data, valor pago, endereço (rua+numero), status, assim que o
// cliente é identificado na tela de Vendas.
// [mcp-local harness] feature: fix-complemento-e-trava-pago | plano: d4d7e0ba | 2026-08-05 22:18:01
// Adiciona campo Complemento faltante no cadastro rapido de cliente
// [mcp-local harness] feature: fix-complemento-e-trava-pago | plano: d4d7e0ba
// Adiciona campo Complemento no cadastro rapido de cliente (faltava,
// so existia no TrocarEnderecoDialog)
// [mcp-local harness] feature: ajustes-endereco-card-mes-data-vale | plano: 15362128
// Botao Adicionar/Trocar endereco (TrocarEnderecoDialog) na secao de cliente
// [mcp-local harness] feature: ajustes-cosmeticos-vendas | plano: 8c042ce9 | 2026-08-05 11:33:18
// CPF/CNPJ label, mascara de telefone (54) padrao, RuaAutocomplete
// [mcp-local harness] feature: fluxo-vendas-distribuidora-frontend | plano: b8adcd52
// Secao de cliente: busca, selecao, quick-add com endereco opcional, sugestao de ultimo endereco transacionado
//
// [mcp-local harness] fix: onError tipado como ApiError (nao unknown)
//
// [mcp-local harness] feature: ajustes-cosmeticos-vendas | plano: 8c042ce9
// Label "CPF" -> "CPF/CNPJ", mascara de telefone com (54) padrao,
// RuaAutocomplete no lugar do datalist nativo
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
  type VendaPublic,
  VendasService,
} from "@/client"
import RuaAutocomplete from "@/components/Common/RuaAutocomplete"
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
import TrocarEnderecoDialog from "@/components/Vendas/TrocarEnderecoDialog"
import useCustomToast from "@/hooks/useCustomToast"
import useSugestoesRua from "@/hooks/useSugestoesRua"
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

function formatDate(iso: string): string {
  const [ano, mes, dia] = iso.split("-")
  return `${dia}/${mes}/${ano}`
}

function formatMoney(valor: string | number): string {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

// Mesmo limite usado no backend (DIAS_ATRASO_VALE em vendas.py) --
// contado a partir de data_venda, só pra decidir o badge de status.
const DIAS_ATRASO_VALE = 30

function isAtrasado(dataVendaISO: string): boolean {
  const dataVenda = new Date(`${dataVendaISO}T00:00:00`)
  const limite = new Date()
  limite.setHours(0, 0, 0, 0)
  limite.setDate(limite.getDate() - DIAS_ATRASO_VALE)
  return dataVenda <= limite
}

/** Vendas fora de "vale" são pagas na hora (pago_em já vem
 * preenchido na criação) -- só o vale passa pelos estados
 * aberto/atraso/aguardando baixa/baixado (ver Recebimento de Vale).
 * Cores (pedido do Ricardo): pago/baixado = fundo verde solido +
 * letra branca; aberto/atraso = fundo vermelho solido + letra
 * branca; aguardando baixa fica azul claro (não fazia parte do
 * pedido). */
function statusVenda(v: VendaPublic): { label: string; className: string } {
  if (v.forma_pagamento !== "vale") {
    return { label: "Pago", className: "bg-green-600 text-white" }
  }
  if (v.pago_em) {
    return { label: "Baixado", className: "bg-green-600 text-white" }
  }
  if (v.recebido_em) {
    return { label: "Aguardando baixa", className: "bg-sky-100 text-sky-800" }
  }
  if (isAtrasado(v.data_venda)) {
    return {
      label: "Em atraso",
      className: "bg-red-600 text-white",
    }
  }
  return { label: "Em aberto", className: "bg-red-600 text-white" }
}

/** Formata dígitos como "(54) 99999-9999", progressivamente enquanto
 * digita. DDD 54 (Veranópolis/RS) já vem preenchido por padrão --
 * editável, o usuário pode apagar e trocar se precisar. */
function formatTelefone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11)
  if (d.length === 0) return ""
  if (d.length <= 2) return `(${d}${d.length === 2 ? ") " : ""}`
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

function HistoricoVendasCliente({ clienteId }: { clienteId: string }) {
  const { data } = useQuery({
    queryKey: ["historicoVendasCliente", clienteId],
    queryFn: () =>
      VendasService.readHistoricoVendasCliente({ clienteId, limit: 3 }),
  })

  if (!data || data.data.length === 0) return null

  return (
    <div className="flex flex-col gap-2 rounded-md border p-2">
      <p className="text-xs font-medium text-muted-foreground">
        Histórico de vendas (últimas {data.data.length})
      </p>
      <div className="flex flex-col gap-1.5">
        {data.data.map((v) => {
          const status = statusVenda(v)
          return (
            <div
              key={v.id}
              className="flex items-center gap-3 border-t pt-1.5 text-sm first:border-t-0 first:pt-0"
            >
              <span className="w-20 shrink-0 text-muted-foreground">
                {formatDate(v.data_venda)}
              </span>
              <span className="w-20 shrink-0 font-medium">
                {formatMoney(v.valor_pago)}
              </span>
              <span className="flex-1 truncate text-muted-foreground">
                {v.endereco
                  ? `${v.endereco.rua_nome}, ${v.endereco.numero}`
                  : "—"}
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${status.className}`}
              >
                {status.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
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
  }, [cliente?.id, cliente, onEnderecoChange])

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
              <span className="flex-1">
                {formatEndereco(enderecoSelecionado)}
              </span>
              <TrocarEnderecoDialog
                cliente={cliente}
                onSalvo={(clienteAtualizado) => {
                  onClienteChange(clienteAtualizado)
                  onEnderecoChange(clienteAtualizado.endereco ?? null)
                }}
              />
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
            <>
              <span className="flex-1 text-muted-foreground">
                Sem endereço nessa venda (opcional)
              </span>
              <TrocarEnderecoDialog
                cliente={cliente}
                onSalvo={(clienteAtualizado) => {
                  onClienteChange(clienteAtualizado)
                  onEnderecoChange(clienteAtualizado.endereco ?? null)
                }}
              />
            </>
          )}
        </div>

        <HistoricoVendasCliente clienteId={cliente.id} />
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
              placeholder="Buscar cliente por nome ou CPF/CNPJ..."
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

function QuickAddCliente({
  onCancel,
  onCreated,
  onError,
}: QuickAddClienteProps) {
  const [nome, setNome] = useState("")
  const [cpf, setCpf] = useState("")
  const [telefone, setTelefone] = useState(() => formatTelefone("54"))
  const [incluirEndereco, setIncluirEndereco] = useState(false)
  const [bairroId, setBairroId] = useState("")
  const [ruaNome, setRuaNome] = useState("")
  const [numero, setNumero] = useState("")
  const [complemento, setComplemento] = useState("")

  const { data: bairros } = useQuery({
    queryKey: ["bairros"],
    queryFn: () => GeografiaService.readBairros(),
    enabled: incluirEndereco,
  })
  const { opcoes: ruasSugeridas } = useSugestoesRua(
    incluirEndereco ? bairroId : undefined,
  )

  const mutation = useMutation({
    mutationFn: (data: ClienteCreate) =>
      ClientesService.createCliente({ requestBody: data }),
    onSuccess: onCreated,
    onError,
  })

  const podeSalvar = nome.trim().length > 0 && cpf.trim().length >= 11

  const onSubmit = () => {
    // Só manda telefone se tiver algo além do DDD padrão (54)
    const telefoneDigits = telefone.replace(/\D/g, "")
    mutation.mutate({
      nome,
      cpf,
      telefone: telefoneDigits.length > 2 ? telefone : undefined,
      endereco:
        incluirEndereco && bairroId && ruaNome && numero
          ? {
              bairro_id: bairroId,
              rua_nome: ruaNome,
              numero,
              complemento: complemento || undefined,
            }
          : undefined,
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="grid gap-1.5">
        <Label htmlFor="qc-nome">
          Nome <span className="text-destructive">*</span>
        </Label>
        <Input
          id="qc-nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="qc-cpf">
            CPF/CNPJ <span className="text-destructive">*</span>
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
            placeholder="(54) 99999-9999"
            value={telefone}
            onChange={(e) => setTelefone(formatTelefone(e.target.value))}
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
            <RuaAutocomplete
              id="qc-rua"
              value={ruaNome}
              onChange={setRuaNome}
              opcoes={ruasSugeridas}
              disabled={!bairroId}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="qc-numero">Número</Label>
              <Input
                id="qc-numero"
                placeholder="123 ou s/n"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="qc-complemento">Complemento</Label>
              <Input
                id="qc-complemento"
                placeholder="Apto, bloco... (opcional)"
                value={complemento}
                onChange={(e) => setComplemento(e.target.value)}
              />
            </div>
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
