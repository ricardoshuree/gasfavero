// [mcp-local harness] feature: vendas-motorista-fix | plano: d4d9c354 | 2026-09-07 12:18:01
// Remove enderecoId do destructuring, mantém na interface para compatibilidade de tipos
// Etapa 2 — Busca de cliente, cadastro rápido e seleção de endereço
import { useEffect, useRef, useState, type CSSProperties } from "react"
import { CORES_APP as C } from "../../theme"
import {
  buscarBairros,
  buscarClientes,
  cadastrarCliente,
  type Bairro,
  type Cliente,
} from "../../lib/vendas"

interface Props {
  token: string
  clienteSelecionado: Cliente | null
  enderecoId: string | null
  onClienteChange: (c: Cliente | null) => void
  onEnderecoChange: (id: string | null) => void
  onProximo: () => void
  onVoltar: () => void
}

type ModoCliente = "busca" | "novo"

export default function EtapaCliente({
  token, clienteSelecionado,
  onClienteChange, onEnderecoChange, onProximo, onVoltar
}: Props) {
  const [modo, setModo] = useState<ModoCliente>("busca")
  const [busca, setBusca] = useState("")
  const [resultados, setResultados] = useState<Cliente[]>([])
  const [buscando, setBuscando] = useState(false)
  const [bairros, setBairros] = useState<Bairro[]>([])

  const [nome, setNome] = useState("")
  const [cpf, setCpf] = useState("")
  const [tel, setTel] = useState("")
  const [bairroId, setBairroId] = useState("")
  const [ruaNome, setRuaNome] = useState("")
  const [numero, setNumero] = useState("")
  const [complemento, setComplemento] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [erroCadastro, setErroCadastro] = useState("")

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    buscarBairros(token).then(setBairros).catch(() => {})
  }, [token])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (busca.trim().length < 2) { setResultados([]); return }
    debounceRef.current = setTimeout(() => {
      setBuscando(true)
      buscarClientes(token, busca.trim())
        .then(setResultados)
        .catch(() => setResultados([]))
        .finally(() => setBuscando(false))
    }, 500)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [busca, token])

  async function handleCadastrar() {
    if (!nome.trim() || !cpf.trim()) { setErroCadastro("Nome e CPF são obrigatórios."); return }
    setSalvando(true)
    setErroCadastro("")
    try {
      const c = await cadastrarCliente(token, {
        nome: nome.trim(),
        cpf: cpf.trim().replace(/\D/g, ""),
        telefone: tel.trim() || undefined,
        endereco: ruaNome.trim() && numero.trim() && bairroId
          ? { bairro_id: bairroId, rua_nome: ruaNome.trim(), numero: numero.trim(), complemento: complemento.trim() || undefined }
          : undefined,
      })
      onClienteChange(c)
      if (c.endereco?.id) onEnderecoChange(c.endereco.id)
      setModo("busca")
    } catch (e: any) {
      setErroCadastro(e.message ?? "Erro ao cadastrar cliente.")
    } finally {
      setSalvando(false)
    }
  }

  function selecionarCliente(c: Cliente) {
    onClienteChange(c)
    onEnderecoChange(c.endereco?.id ?? null)
    setBusca("")
    setResultados([])
  }

  function formatarEndereco(c: Cliente) {
    if (!c.endereco) return "Sem endereço"
    const { rua_nome, numero, bairro_nome } = c.endereco
    return `${rua_nome}, ${numero} — ${bairro_nome}`
  }

  return (
    <div style={s.pagina}>
      {modo === "busca" && (
        <>
          {clienteSelecionado && (
            <div style={s.clienteCard}>
              <div style={s.clienteNome}>{clienteSelecionado.nome}</div>
              <div style={s.clienteSub}>CPF {clienteSelecionado.cpf}</div>
              <div style={s.clienteEnd}>{formatarEndereco(clienteSelecionado)}</div>
              <button style={s.btnTrocar} onClick={() => { onClienteChange(null); onEnderecoChange(null) }}>
                Trocar cliente
              </button>
            </div>
          )}

          {!clienteSelecionado && (
            <>
              <div style={s.searchBox}>
                <span style={s.searchIcon}>🔍</span>
                <input
                  style={s.searchInput}
                  placeholder="Buscar por nome ou CPF..."
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  autoFocus
                />
                {busca && (
                  <button style={s.clearBtn} onClick={() => { setBusca(""); setResultados([]) }}>✕</button>
                )}
              </div>
              {buscando && <p style={s.info}>Buscando...</p>}
              {resultados.map(c => (
                <div key={c.id} style={s.resultado} onClick={() => selecionarCliente(c)}>
                  <div style={s.resNome}>{c.nome}</div>
                  <div style={s.resSub}>CPF {c.cpf} · {formatarEndereco(c)}</div>
                </div>
              ))}
              {busca.trim().length >= 2 && !buscando && resultados.length === 0 && (
                <p style={s.info}>Nenhum cliente encontrado.</p>
              )}
            </>
          )}

          <div style={s.separator} />
          <button style={s.btnNovo} onClick={() => setModo("novo")}>
            + Cadastrar novo cliente
          </button>

          <div style={s.rodape}>
            <button style={s.btnVoltar} onClick={onVoltar}>← Voltar</button>
            <button
              style={{ ...s.btnProximo, opacity: clienteSelecionado ? 1 : 0.4 }}
              disabled={!clienteSelecionado}
              onClick={onProximo}
            >
              Próximo →
            </button>
          </div>
        </>
      )}

      {modo === "novo" && (
        <div style={s.form}>
          <p style={s.formTitulo}>Novo cliente</p>

          <label style={s.label}>Nome *</label>
          <input style={s.input} value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo" />

          <label style={s.label}>CPF *</label>
          <input style={s.input} value={cpf} onChange={e => setCpf(e.target.value)} placeholder="000.000.000-00" inputMode="numeric" />

          <label style={s.label}>Telefone</label>
          <input style={s.input} value={tel} onChange={e => setTel(e.target.value)} placeholder="(54) 9..." inputMode="tel" />

          <p style={s.secao}>Endereço (opcional)</p>

          <label style={s.label}>Bairro</label>
          <select style={s.input} value={bairroId} onChange={e => setBairroId(e.target.value)}>
            <option value="">Selecione...</option>
            {bairros.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>

          <label style={s.label}>Rua</label>
          <input style={s.input} value={ruaNome} onChange={e => setRuaNome(e.target.value)} placeholder="Nome da rua" />

          <div style={s.rowDois}>
            <div style={{ flex: 1 }}>
              <label style={s.label}>Número</label>
              <input style={s.input} value={numero} onChange={e => setNumero(e.target.value)} placeholder="123" inputMode="numeric" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={s.label}>Complemento</label>
              <input style={s.input} value={complemento} onChange={e => setComplemento(e.target.value)} placeholder="Apto, casa..." />
            </div>
          </div>

          {erroCadastro && <p style={s.erro}>{erroCadastro}</p>}

          <div style={s.rodape}>
            <button style={s.btnVoltar} onClick={() => setModo("busca")}>← Cancelar</button>
            <button style={s.btnProximo} onClick={handleCadastrar} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar →"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const s: Record<string, CSSProperties> = {
  pagina: { padding: "0.75rem 1rem 1.5rem" },
  info: { color: C.textoSecundario, fontSize: "0.85rem", textAlign: "center", padding: "0.75rem 0" },
  searchBox: {
    display: "flex", alignItems: "center", gap: "8px",
    background: C.fundoCard, border: `1px solid ${C.borda}`,
    borderRadius: "10px", padding: "10px 12px", marginBottom: "8px",
  },
  searchIcon: { fontSize: "16px" },
  searchInput: {
    border: "none", background: "transparent", fontSize: "15px",
    color: C.texto, flex: 1, outline: "none",
  },
  clearBtn: { background: "none", border: "none", fontSize: "14px", color: C.textoSecundario, cursor: "pointer", padding: 0 },
  resultado: {
    background: C.fundoCard, border: `1px solid ${C.borda}`,
    borderRadius: "10px", padding: "12px", marginBottom: "6px", cursor: "pointer",
  },
  resNome: { fontSize: "14px", fontWeight: 600, color: C.texto },
  resSub: { fontSize: "12px", color: C.textoSecundario, marginTop: "2px" },
  clienteCard: {
    background: "#f0f4eb", border: "2px solid #606C38",
    borderRadius: "12px", padding: "12px 14px", marginBottom: "12px",
  },
  clienteNome: { fontSize: "15px", fontWeight: 700, color: C.texto },
  clienteSub: { fontSize: "12px", color: C.textoSecundario, marginTop: "2px" },
  clienteEnd: { fontSize: "12px", color: C.textoSecundario, marginTop: "4px" },
  btnTrocar: {
    marginTop: "8px", background: "transparent", border: `1px solid #606C38`,
    color: "#606C38", borderRadius: "8px", padding: "6px 12px", fontSize: "13px", cursor: "pointer",
  },
  separator: { borderTop: `1px solid ${C.borda}`, margin: "12px 0" },
  btnNovo: {
    width: "100%", background: "transparent", border: `1.5px solid ${C.borda}`,
    borderRadius: "12px", padding: "12px", fontSize: "15px",
    color: C.texto, cursor: "pointer", textAlign: "center" as const,
  },
  rodape: { display: "flex", gap: "10px", marginTop: "16px" },
  btnVoltar: {
    flex: 1, background: "transparent", border: `1px solid ${C.borda}`,
    borderRadius: "12px", padding: "13px", fontSize: "15px", color: C.texto, cursor: "pointer",
  },
  btnProximo: {
    flex: 2, background: "#606C38", color: "#F8FAFC", border: "none",
    borderRadius: "12px", padding: "13px", fontSize: "15px", fontWeight: 600, cursor: "pointer",
  },
  form: { display: "flex", flexDirection: "column", gap: "4px" },
  formTitulo: { fontSize: "16px", fontWeight: 700, color: C.texto, margin: "0 0 8px" },
  secao: { fontSize: "13px", fontWeight: 600, color: C.textoSecundario, margin: "8px 0 4px" },
  label: { fontSize: "13px", color: C.textoSecundario, marginBottom: "2px" },
  input: {
    width: "100%", boxSizing: "border-box" as const, padding: "10px 12px",
    border: `1px solid ${C.borda}`, borderRadius: "10px",
    fontSize: "15px", color: C.texto, background: C.fundoCardInterno,
    marginBottom: "6px", outline: "none",
  },
  rowDois: { display: "flex", gap: "8px" },
  erro: { color: C.erro, fontSize: "13px", margin: "4px 0" },
}
