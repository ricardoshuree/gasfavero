// [mcp-local harness] feature: casco-venda-mobile | plano: cef0cb24 | 2026-09-13 09:21:43
// ResumoConfirmacao: exibe cascos comprados e emprestados, envia com_casco nos itens e cascos[] na venda. Suporte a mix de pagamento.
// ResumoConfirmacao — resumo final antes de confirmar e submeter a venda
// Inclui cascos comprados (com_casco=true) e cascos emprestados (cascos[])
import { useState, type CSSProperties } from "react"
import { CORES_APP as C } from "../../theme"
import { criarVenda, type CascoEmprestimo, type Cliente, type DadosPagamento, type ItemSacola } from "../../lib/vendas"

const LABEL_FORMA: Record<string, string> = {
  cartao_debito:  "Cartão Débito",
  cartao_credito: "Cartão Crédito",
  pix:            "Pix",
  dinheiro:       "Dinheiro",
  vale:           "Fiado",
  vale_gas:       "Vale Gás",
  gas_povo:       "Gás do Povo",
}

const ERROS_NEGOCIO = [
  "ja foi usado", "já foi usado",
  "pertence ao bloco de outro motorista", "outro motorista",
  "ja tem uma venda a prazo em aberto", "já tem uma venda a prazo em aberto",
  "bloco nao encontrado", "bloco não encontrado",
  "fora do intervalo",
  "numero de vale gas invalido", "número de vale gás inválido",
]

function ehErroNegocio(msg: string): boolean {
  return ERROS_NEGOCIO.some(p => msg.toLowerCase().includes(p))
}

interface Props {
  token: string
  motoristaId: string
  cliente: Cliente
  enderecoId: string | null
  sacola: ItemSacola[]
  cascos: CascoEmprestimo[]   // cascos emprestados (não cobrados)
  pagamento: DadosPagamento
  onVoltar: () => void
  onSucesso: () => void
}

export default function ResumoConfirmacao({
  token, motoristaId, cliente, enderecoId, sacola, cascos, pagamento, onVoltar, onSucesso
}: Props) {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState("")

  // Total: gás + cascos comprados
  const total = sacola.reduce((acc, i) => {
    const gas = Number(i.precoUnitario) * i.quantidade
    const casco = i.comCasco && i.precoCascoAtual ? Number(i.precoCascoAtual) * i.quantidade : 0
    return acc + gas + casco
  }, 0)

  // Valor exibido no resumo
  const valorExibido = pagamento.forma === "gas_povo"
    ? (parseFloat(pagamento.gasPovoValorGov ?? "0") || 0) + (parseFloat(pagamento.gasPovoFrete ?? "0") || 0)
    : pagamento.pagamentos && pagamento.pagamentos.length > 0
      ? pagamento.pagamentos.reduce((acc, p) => acc + p.valor, 0)
      : parseFloat(pagamento.valorPago ?? String(total))

  const totalCascosEmprestados = cascos.reduce((acc, c) => acc + c.quantidade, 0)
  async function confirmar() {
    setEnviando(true); setErro("")
    try {
      const hoje = new Date().toISOString().slice(0, 10)

      // Mix de pagamento
      const usaMix = pagamento.pagamentos && pagamento.pagamentos.length > 1
      const formaPrincipal = pagamento.pagamentos && pagamento.pagamentos.length > 0
        ? pagamento.pagamentos[0].forma_pagamento as any
        : pagamento.forma

      const valorPagoEnvio = pagamento.forma === "gas_povo"
        ? (pagamento.gasPovoValorGov ?? "0")
        : usaMix
          ? String(pagamento.pagamentos!.reduce((acc, p) => acc + p.valor, 0).toFixed(2))
          : (pagamento.valorPago ?? String(total.toFixed(2)))

      await criarVenda(token, {
        cliente_id: cliente.id,
        endereco_id: enderecoId ?? cliente.endereco?.id,
        motorista_id: motoristaId,
        forma_pagamento: formaPrincipal,
        // Mix: envia lista de pagamentos
        pagamentos: usaMix ? pagamento.pagamentos : undefined,
        // Forma única: campos legado
        vale_numero: !usaMix && pagamento.forma === "vale" && pagamento.valeNumero
          ? Number(pagamento.valeNumero) : undefined,
        data_pagamento_vale: !usaMix && pagamento.forma === "vale" && pagamento.dataPagamentoVale
          ? pagamento.dataPagamentoVale : undefined,
        vale_gas_numero: pagamento.forma === "vale_gas" && pagamento.valeGasNumero
          ? Number(pagamento.valeGasNumero) : undefined,
        vale_gas_bloco_id: pagamento.forma === "vale_gas" ? (pagamento.valeGasBlocoId ?? undefined) : undefined,
        gas_povo_frete: pagamento.forma === "gas_povo" ? pagamento.gasPovoFrete : undefined,
        valor_pago: valorPagoEnvio,
        data_venda: hoje,
        // Itens: com_casco=true quando cliente comprou o casco
        itens: sacola.map(i => ({
          produto_id: i.produtoId,
          quantidade: i.quantidade,
          com_casco: i.comCasco,
        })),
        // Cascos emprestados (vasilhame — não cobrado)
        cascos: cascos.length > 0 ? cascos : undefined,
      })
      onSucesso()
    } catch (e: any) {
      setErro(e.message ?? "Erro ao registrar venda.")
    } finally { setEnviando(false) }
  }

  const isNegocio = erro && ehErroNegocio(erro)

  const enderecoExibicao = cliente.endereco
    ? `${cliente.endereco.rua_nome}, ${cliente.endereco.numero} — ${cliente.endereco.bairro_nome}`
    : null

  return (
    <div style={s.pagina}>
      <p style={s.titulo}>Confirmar venda</p>

      {/* Cliente */}
      <div style={s.secao}>
        <p style={s.secaoLabel}>Cliente</p>
        <p style={s.secaoValor}>{cliente.nome}</p>
        {enderecoExibicao && <p style={s.secaoSub}>📍 {enderecoExibicao}</p>}
      </div>

      {/* Produtos */}
      <div style={s.secao}>
        <p style={s.secaoLabel}>Produtos</p>
        {sacola.map(i => {
          const subtotalGas = Number(i.precoUnitario) * i.quantidade
          const subtotalCasco = i.comCasco && i.precoCascoAtual ? Number(i.precoCascoAtual) * i.quantidade : 0
          return (
            <div key={i.produtoId}>
              <div style={s.itemRow}>
                <span>{i.quantidade}× {i.titulo}</span>
                <span>R$ {subtotalGas.toFixed(2).replace(".", ",")}</span>
              </div>
              {i.comCasco && subtotalCasco > 0 && (
                <div style={{ ...s.itemRow, ...s.itemCasco }}>
                  <span>📦 Casco ({i.quantidade}×)</span>
                  <span>+R$ {subtotalCasco.toFixed(2).replace(".", ",")}</span>
                </div>
              )}
            </div>
          )
        })}
        <div style={s.totalRow}>
          <span>Total</span>
          <span>R$ {total.toFixed(2).replace(".", ",")}</span>
        </div>
      </div>

      {/* Cascos emprestados */}
      {totalCascosEmprestados > 0 && (
        <div style={s.secaoCasco}>
          <p style={s.secaoLabel}>📦 Empréstimo de casco</p>
          {cascos.map(c => {
            const prod = sacola.find(i => i.produtoId === c.produto_id)
            return (
              <p key={c.produto_id} style={s.secaoSub}>
                {c.quantidade}× {prod?.titulo ?? c.produto_id} — emprestado (sem cobrança)
              </p>
            )
          })}
        </div>
      )}

      {/* Pagamento */}
      <div style={s.secao}>
        <p style={s.secaoLabel}>Pagamento</p>
        {pagamento.pagamentos && pagamento.pagamentos.length > 1 ? (
          // Mix
          pagamento.pagamentos.map((p, i) => (
            <div key={i} style={s.itemRow}>
              <span>{LABEL_FORMA[p.forma_pagamento] ?? p.forma_pagamento}
                {p.vale_numero ? ` · Folha ${p.vale_numero}` : ""}</span>
              <span>R$ {p.valor.toFixed(2).replace(".", ",")}</span>
            </div>
          ))
        ) : (
          <>
            <p style={s.secaoValor}>{LABEL_FORMA[pagamento.forma] ?? pagamento.forma}</p>
            {pagamento.forma === "vale" && <p style={s.secaoSub}>Fiado nº {pagamento.valeNumero}</p>}
            {pagamento.forma === "gas_povo" && (
              <>
                <p style={s.secaoSub}>Valor gov: R$ {parseFloat(pagamento.gasPovoValorGov ?? "0").toFixed(2).replace(".", ",")}</p>
                <p style={s.secaoSub}>Frete cliente: R$ {parseFloat(pagamento.gasPovoFrete ?? "0").toFixed(2).replace(".", ",")}</p>
              </>
            )}
          </>
        )}
        <div style={s.totalRow}>
          <span>Valor a receber</span>
          <span>R$ {valorExibido.toFixed(2).replace(".", ",")}</span>
        </div>
      </div>

      {erro && (
        <div style={isNegocio ? s.avisoNegocio : s.erroServidor}>
          {isNegocio ? "⚠️ " : "❌ "}{erro}
        </div>
      )}

      <div style={s.rodape}>
        <button style={s.btnEditar} onClick={onVoltar} disabled={enviando}>← Editar</button>
        <button style={s.btnConfirmar} onClick={confirmar} disabled={enviando}>
          {enviando ? "Enviando..." : "✓ Confirmar"}
        </button>
      </div>
    </div>
  )
}

const s: Record<string, CSSProperties> = {
  pagina:      { padding: "0.75rem 1rem 1.5rem" },
  titulo:      { fontSize: "17px", fontWeight: 700, color: C.texto, margin: "0 0 12px" },
  secao:       { background: C.fundoCard, border: `1px solid ${C.borda}`, borderRadius: "12px", padding: "12px 14px", marginBottom: "10px" },
  secaoCasco:  { background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: "12px", padding: "12px 14px", marginBottom: "10px" },
  secaoLabel:  { fontSize: "11px", fontWeight: 600, color: C.textoSecundario, textTransform: "uppercase" as const, margin: "0 0 4px", letterSpacing: "0.5px" },
  secaoValor:  { fontSize: "15px", fontWeight: 600, color: C.texto, margin: "0 0 2px" },
  secaoSub:    { fontSize: "13px", color: C.textoSecundario, margin: "2px 0 0" },
  itemRow:     { display: "flex", justifyContent: "space-between", fontSize: "14px", color: C.texto, padding: "3px 0" },
  itemCasco:   { fontSize: "12px", color: "#92400e", paddingLeft: "8px" },
  totalRow:    { display: "flex", justifyContent: "space-between", fontSize: "15px", fontWeight: 700, color: C.texto, borderTop: `1px solid ${C.borda}`, marginTop: "8px", paddingTop: "8px" },
  avisoNegocio:{ background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: "10px", padding: "10px 12px", fontSize: "13px", color: "#92400e", margin: "8px 0", lineHeight: "1.5" },
  erroServidor:{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "10px", padding: "10px 12px", fontSize: "13px", color: "#991b1b", margin: "8px 0", lineHeight: "1.5" },
  rodape:      { display: "flex", gap: "10px", marginTop: "16px" },
  btnEditar:   { flex: 1, background: "transparent", border: "1.5px solid #374151", borderRadius: "12px", padding: "13px", fontSize: "15px", color: "#111111", fontWeight: 700, cursor: "pointer" },
  btnConfirmar:{ flex: 2, background: "#606C38", color: "#F8FAFC", border: "none", borderRadius: "12px", padding: "13px", fontSize: "16px", fontWeight: 700, cursor: "pointer" },
}

