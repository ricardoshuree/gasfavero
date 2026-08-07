// [mcp-local harness] feature: frontend-motorista-redesign-ifood | plano: 46dc14df | 2026-08-07 19:18:31
// Duas paletas: CORES_LOGIN (dark, so pro Login) e CORES_APP (estilo iFood, todo o resto)
// Paletas do app do motorista -- fonte única de verdade das cores.
//
// CORES_LOGIN: paleta "camo" da Distribuidora, usada SÓ na tela de
// Login (Coolors: Olive Leaf, Dark Spruce, Dry Sage).
//
// CORES_APP: paleta "estilo iFood" pedida pelo cliente pra todas as
// OUTRAS telas (fundo branco, texto preto, destaque vermelho) --
// referência visual: apps de delivery que os motoristas já conhecem,
// baixa curva de aprendizado.
//
// Trocar qualquer paleta inteira é editar só este arquivo; todas as
// telas importam daqui em vez de hex hardcoded.

export const CORES_LOGIN = {
  /** Fundo das telas -- verde escuro ("Dark Spruce") */
  fundo: "#283618",
  /** Texto sobre o fundo escuro -- branco gelo */
  texto: "#F8FAFC",
  /** Botões de ação primária -- verde oliva ("Olive Leaf") */
  botao: "#606C38",
  /** Texto sobre botões (contraste com #606C38) */
  botaoTexto: "#F8FAFC",
  /** Fundo dos campos de formulário -- bege claro ("Dry Sage") */
  campo: "#C5C9A4",
  /** Texto digitado dentro dos campos (contraste com #C5C9A4) */
  campoTexto: "#283618",
  /** Borda dos campos de formulário */
  campoBorda: "#334155",
  /** Mensagens de erro */
  erro: "#f87171",
} as const

export const CORES_APP = {
  /** Fundo geral das telas (exceto Login) */
  fundo: "#FFFFFF",
  /** Fundo dos cards -- cinza claro, mesmo tom usado no iFood */
  fundoCard: "#F5F5F5",
  /** Área branca interna dos cards (destaca do fundo cinza do card) */
  fundoCardInterno: "#FFFFFF",
  /** Texto principal -- preto (não 100% puro, mais suave) */
  texto: "#1A1A1A",
  /** Texto secundário -- cinza (descrições, horários, endereço) */
  textoSecundario: "#6B7280",
  /** Vermelho de marca -- ação primária (Aceitar), mesmo tom do iFood */
  destaque: "#EA1D2C",
  /** Texto sobre o vermelho de marca */
  destaqueTexto: "#FFFFFF",
  /** Azul -- estado "aceito, aguardando chegada" (botão Cheguei) */
  aceito: "#2563EB",
  /** Texto sobre o azul */
  aceitoTexto: "#FFFFFF",
  /** Bordas e divisórias sutis */
  borda: "#E5E7EB",
  /** Bolinha de status "Disponível" -- sinalização universal, não
   * segue a paleta de marca de propósito (verde/cinza é convenção) */
  statusOn: "#22C55E",
  statusOff: "#9CA3AF",
  /** Mensagens de erro */
  erro: "#DC2626",
} as const
