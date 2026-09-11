// [mcp-local harness] feature: fix-build-errors | plano: 1097e958 | 2026-09-11 20:05:41
// readCascosCliente → cascosPorCliente (nome correto no client gerado)
// fix: readCascosCliente → cascosPorCliente (nome correto no client gerado)
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Loader2, MapPin, Package, Plus, Search, User, X } from "lucide-react"
import { useEffect, useState } from "react"

import {
  type ApiError,
  CascosService,
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

const CAMPO_ACESSIVEL = "h-12 px-4 text-base"
const LABEL_ACESSIVEL = "text-base"

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

const DIAS_ATRASO_VALE = 30

function isAtrasado(dataVendaISO: string): boolean {
  const dataVenda = new Date(`${dataVendaISO}T00:00:00`)
  const limite = new Date()
  limite.setHours(0, 0, 0, 0)
  limite.setDate(limite.getDate() - DIAS_ATRASO_VALE)
  return dataVenda <= limite
}

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
    return { label: "Em atraso", className: "bg-red-600 text-white" }
  }
  return { label: "Em aberto", className: "bg-red-600 text-white" }
}

function formatTelefone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11)
  if (d.length === 0) return ""
  if (d.length <= 2) return `(${d}${d.length === 2 ? ") " : ""}`
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

function AvisoFiadoCliente({ clienteId }: { clienteId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["vendas-cliente-fiado", clienteId],
    queryFn: () => VendasService.readHistoricoVendasCliente({ clienteId, limit: 50 }),
  })

  if (isLoading) return null

  const fiados = (data?.data ?? []).filter(
    (v) => v.forma_pagamento === "vale" && !v.pago_em && v.status !== "cancelada"
  )

  if (fiados.length === 0) return null

  const total = fiados.reduce((acc, v) => acc + Number(v.valor_total), 0)
  const temAtraso = fiados.some((v) => isAtrasado(v.data_venda))

  return (
    <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
      temAtraso
        ? "border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/30"
        : "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30"
    }`}>
      <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${
        temAtraso ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
      }`} aria-hidden="true" />
      <span className={temAtraso ? "text-red-800 dark:text-red-200" : "text-amber-800 dark:text-amber-200"}>
        {temAtraso ? "⚠️" : "ℹ️"} Cliente tem{" "}
        <strong>{fiados.length} fiado{fiados.length !== 1 ? "s" : ""} em aberto</strong>
        {" "}— total {formatMoney(total)}
        {temAtraso ? " (com atraso)" : ""}. A venda pode prosseguir.
      </span>
    </div>
  )
}

function HistoricoVendasCliente({ clienteId }: { clienteId: string }) {
  const { data: historicoData, isLoading: historicoLoading } = useQuery({
    queryKey: ["historicoVendasCliente", clienteId],
    queryFn: () =>
      VendasService.readHistoricoVendasCliente({ clienteId, limit: 3 }),
  })

  const { data: cascosData } = useQuery({
    queryKey: ["cascos", "cliente", clienteId],
    // nome correto no client gerado: cascosPorCliente
    queryFn: () => CascosService.cascosPorCliente({ clienteId }),
    retry: false,
  })

  const cascosPorVenda = new Map<string, number>()
  if (cascosData?.cascos) {
    for (const c of cascosData.cascos) {
      if (c.status !== "devolvido") {
        cascosPorVenda.set(c.venda_id, (cascosPorVenda.get(c.venda_id) ?? 0) + c.quantidade)
      }
    }
  }

  if (historicoLoading) {
    return (
      <div className="flex items-center gap-2 rounded-md border p-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Carregando histórico...
      </div>
    )
  }

  if (!historicoData || historicoData.data.length === 0) return null

  return (
    <div className="flex flex-col gap-2 rounded-md border p-2">
      <p className="text-xs font-medium text-muted-foreground">
        Histórico de vendas (últimas {historicoData.data.length})
      </p>
      <div className="flex flex-col gap-1.5">
        {historicoData.data.map((v) => {
          const status = statusVenda(v)
          const qtdCascoAberto = cascosPorVenda.get(v.id) ?? 0
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
              <div className="flex shrink-0 items-center gap-1.5">
                {qtdCascoAberto > 0 && (
                  <span
                    className="flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                    title={`${qtdCascoAberto} casco(s) emprestado(s) nesta venda`}
                  >
                    <Package className="h-3 w-3" aria-hidden="true" />
                    ⚠️ {qtdCascoAberto}
                  </span>
                )}
                <span className={`rounded-full px-2 py-0.5 text-xs ${status.className}`}>
                  {status.label}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AvisoCascosCliente({ clienteId }: { clienteId: string }) {
  const { data } = useQuery({
    queryKey: ["cascos", "cliente", clienteId],
    queryFn: () => CascosService.cascosPorCliente({ clienteId }),
    retry: false,
  })

  if (!data || data.total_cascos_abertos === 0) return null

  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-700 dark:bg-amber-950/30">
      <Package className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <span className="text-amber-800 dark:text-amber-200">
        ⚠️ Este cliente tem{" "}
        <strong>{data.total_cascos_abertos} casco{data.total_cascos_abertos !== 1 ? "s" : ""}</strong>{" "}
        emprestado{data.total_cascos_abertos !== 1 ? "s" : ""} em aberto
      </span>
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
      <div className="flex flex-col gap-4 rounded-lg border-2 border-primary bg-primary/10 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <User className="h-6 w-6 text-primary" />
            <div>
              <p className="text-lg font-semibold">{cliente.nome}</p>
              <p className="text-base text-muted-foreground">
                {cliente.cpf}
                {cliente.telefone ? ` · ${cliente.telefone}` : ""}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            onClick={() => onClienteChange(null)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <AvisoFiadoCliente clienteId={cliente.id} />
        <AvisoCascosCliente clienteId={cliente.id} />

        <div className="flex items-center gap-2 text-base">
          <MapPin className="h-5 w-5 shrink-0 text-muted-foreground" />
          {enderecoSelecionado ? (
            <>
              <span className="flex-1">{formatEndereco(enderecoSelecionado)}</span>
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
                size="default"
                className="text-base"
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
    <div className="flex flex-col gap-4">
      {!showQuickAdd ? (
        <>
          <div className="relative">
            <Input
              className={`pr-11 ${CAMPO_ACESSIVEL}`}
              placeholder="Buscar cliente por nome ou CPF/CNPJ..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Search className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>

          {resultados && resultados.data.length > 0 && (
            <div className="flex flex-col gap-1 rounded-lg border p-1">
              {resultados.data.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="rounded-md px-3 py-2.5 text-left text-base hover:bg-primary/10 hover:text-primary transition-colors"
                  onClick={() => {
                    onClienteChange(c)
                    setQuery("")
                  }}
                >
                  <span className="font-medium text-primary">{c.nome}</span>{" "}
                  <span className="text-muted-foreground">— {c.cpf}</span>
                </button>
              ))}
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-12 text-base"
            onClick={() => setShowQuickAdd(true)}
          >
            <Plus className="mr-2 h-5 w-5" />
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

interface QuickAddClienteProps {
  onCancel: () => void
  onCreated: (cliente: ClientePublic) => void
  onError: (error: ApiError) => void
}

function QuickAddCliente({ onCancel, onCreated, onError }: QuickAddClienteProps) {
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
  const { opcoes: ruasSugeridas } = useSugestoesRua(incluirEndereco ? bairroId : undefined)

  const mutation = useMutation({
    mutationFn: (data: ClienteCreate) => ClientesService.createCliente({ requestBody: data }),
    onSuccess: onCreated,
    onError,
  })

  const podeSalvar = nome.trim().length > 0 && cpf.trim().length >= 11

  const onSubmit = () => {
    const telefoneDigits = telefone.replace(/\D/g, "")
    mutation.mutate({
      nome,
      cpf,
      telefone: telefoneDigits.length > 2 ? telefone : undefined,
      endereco:
        incluirEndereco && bairroId && ruaNome && numero
          ? { bairro_id: bairroId, rua_nome: ruaNome, numero, complemento: complemento || undefined }
          : undefined,
    })
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="grid gap-2">
        <Label htmlFor="qc-nome" className={LABEL_ACESSIVEL}>
          Nome <span className="text-destructive">*</span>
        </Label>
        <Input id="qc-nome" className={CAMPO_ACESSIVEL} value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="qc-cpf" className={LABEL_ACESSIVEL}>
            CPF/CNPJ <span className="text-destructive">*</span>
          </Label>
          <Input id="qc-cpf" className={CAMPO_ACESSIVEL} placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="qc-telefone" className={LABEL_ACESSIVEL}>Telefone</Label>
          <Input id="qc-telefone" className={CAMPO_ACESSIVEL} placeholder="(54) 99999-9999" value={telefone} onChange={(e) => setTelefone(formatTelefone(e.target.value))} />
        </div>
      </div>

      {!incluirEndereco ? (
        <Button type="button" variant="ghost" size="default" className="w-fit text-base" onClick={() => setIncluirEndereco(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Adicionar endereço (opcional)
        </Button>
      ) : (
        <div className="grid gap-4 rounded-md bg-muted/40 p-3">
          <div className="grid gap-2">
            <Label className={LABEL_ACESSIVEL}>Bairro</Label>
            <Select value={bairroId} onValueChange={(v) => { setBairroId(v); setRuaNome("") }}>
              <SelectTrigger className={`w-full ${CAMPO_ACESSIVEL}`}>
                <SelectValue placeholder="Selecione o bairro" />
              </SelectTrigger>
              <SelectContent>
                {bairros?.data.map((b) => (
                  <SelectItem key={b.id} value={b.id} className="py-2.5 text-base">{b.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="qc-rua" className={LABEL_ACESSIVEL}>Rua</Label>
            <RuaAutocomplete id="qc-rua" value={ruaNome} onChange={setRuaNome} opcoes={ruasSugeridas} disabled={!bairroId} className={CAMPO_ACESSIVEL} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="qc-numero" className={LABEL_ACESSIVEL}>Número</Label>
              <Input id="qc-numero" className={CAMPO_ACESSIVEL} placeholder="123 ou s/n" value={numero} onChange={(e) => setNumero(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="qc-complemento" className={LABEL_ACESSIVEL}>Complemento</Label>
              <Input id="qc-complemento" className={CAMPO_ACESSIVEL} placeholder="Apto, bloco... (opcional)" value={complemento} onChange={(e) => setComplemento(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" size="lg" className="h-12 text-base" onClick={onCancel}>Cancelar</Button>
        <Button type="button" size="lg" className="h-12 text-base" disabled={!podeSalvar || mutation.isPending} onClick={onSubmit}>Salvar Cliente</Button>
      </div>
    </div>
  )
}

export default ClienteSection
