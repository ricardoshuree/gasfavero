// [mcp-local harness] feature: chamado-tela | plano: 4507b69c | 2026-08-07 07:59:03
// Adiciona item Chamado (modulo delegacao) no menu, logo abaixo de Mapa
/**
 * AppSidebar — menu lateral dinâmico por módulo/role.
 *
 * Itens fixos (sempre visíveis para usuários autenticados):
 *   - Dashboard
 *
 * Itens controlados por módulo (visíveis se can_read):
 *   - Vendas             → módulo "vendas"
 *   - Recebimento de Vale → módulo "vendas" (mesma permissão de Vendas)
 *   - Livro de Vendas    → módulo "livro_vendas" (módulo próprio, não
 *                           reaproveita "vendas" -- pode ser restrito
 *                           independentemente, ex: só "gerente")
 *   - Inadimplentes      → módulo "inadimplencia" (já existia
 *                           cadastrado no banco desde a migration de
 *                           módulos de negócio, nunca usado até agora)
 *   - Mapa               → módulo "mapa" (idem -- já existia
 *                           cadastrado, nunca usado até a Fase 3 da
 *                           Delegação de Venda). Só visualização
 *                           (marcadores de motoristas via polling).
 *   - Chamado            → módulo "delegacao" (mesmo módulo dos
 *                           endpoints de demandas-venda). Tela onde o
 *                           atendente despacha uma entrega -- fica
 *                           logo abaixo de Mapa, pedido do Ricardo.
 *   - Produtos            → módulo "produtos" (gasfavero-específico)
 *   - Preços             → módulo "produtos" (mesmo módulo, tela diferente)
 *   - Clientes           → módulo "clientes"
 *   - Bloco de Vale      → módulo "vales"
 *   - Usuários            → módulo "usuarios"
 *   - Configurações       → módulo "configuracoes"
 *
 * Itens exclusivos de superuser:
 *   - Admin        → apenas is_superuser
 *   - Permissões   → apenas is_superuser (matriz Role x Módulo x Ação)
 *
 * Para adicionar um novo módulo num ERP filho:
 *   1. Cadastre o módulo no banco (migration ou seed)
 *   2. Adicione uma entrada em MODULE_ITEMS abaixo com o mesmo nome de módulo
 *   3. O menu aparece automaticamente para quem tiver permissão
 */

import {
  AlertTriangle,
  Banknote,
  Book,
  Box,
  HandCoins,
  Home,
  MapPin,
  Package,
  PhoneCall,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Ticket,
  Users,
  UsersRound,
} from "lucide-react"

import { SidebarAppearance } from "@/components/Common/Appearance"
import { Logo } from "@/components/Common/Logo"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar"
import useAuth from "@/hooks/useAuth"
import { usePermissions } from "@/hooks/usePermissions"
import { type Item, Main } from "./Main"
import { User } from "./User"

// Itens sempre visíveis para qualquer usuário autenticado
const FIXED_ITEMS: Item[] = [{ icon: Home, title: "Dashboard", path: "/" }]

// Mapeamento de módulo → item de menu
// O campo "module" deve coincidir exatamente com o nome do módulo no banco
const MODULE_ITEMS: Array<Item & { module: string }> = [
  { module: "vendas", icon: ShoppingCart, title: "Vendas", path: "/vendas" },
  {
    module: "vendas",
    icon: HandCoins,
    title: "Recebimento de Vale",
    path: "/recebimento-vale",
  },
  {
    module: "livro_vendas",
    icon: Book,
    title: "Livro de Vendas",
    path: "/livro-vendas",
  },
  {
    module: "inadimplencia",
    icon: AlertTriangle,
    title: "Inadimplentes",
    path: "/inadimplentes",
  },
  { module: "mapa", icon: MapPin, title: "Mapa", path: "/mapa" },
  {
    module: "delegacao",
    icon: PhoneCall,
    title: "Chamado",
    path: "/chamado",
  },
  { module: "produtos", icon: Box, title: "Produtos", path: "/produtos" },
  { module: "produtos", icon: Banknote, title: "Preços", path: "/precos" },
  {
    module: "clientes",
    icon: UsersRound,
    title: "Clientes",
    path: "/clientes",
  },
  { module: "vales", icon: Ticket, title: "Bloco de Vale", path: "/vales" },
  { module: "usuarios", icon: Users, title: "Usuários", path: "/admin" },
  {
    module: "configuracoes",
    icon: Settings,
    title: "Configurações",
    path: "/settings",
  },
]

// Itens exclusivos de superuser (acesso administrativo completo)
const ADMIN_ITEM: Item = { icon: Package, title: "Admin", path: "/admin" }
const PERMISSIONS_ITEM: Item = {
  icon: ShieldCheck,
  title: "Permissões",
  path: "/permissions",
}

export function AppSidebar() {
  const { user: currentUser } = useAuth()
  const { canRead, isLoading } = usePermissions()

  // Monta os itens de menu de acordo com as permissões
  const moduleItems: Item[] = isLoading
    ? [] // não mostra nada enquanto carrega — evita flash de itens
    : MODULE_ITEMS.filter((item) => canRead(item.module))

  const items: Item[] = [
    ...FIXED_ITEMS,
    ...moduleItems,
    ...(currentUser?.is_superuser ? [ADMIN_ITEM, PERMISSIONS_ITEM] : []),
  ]

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-6 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:items-center">
        <Logo variant="responsive" />
      </SidebarHeader>
      <SidebarContent>
        <Main items={items} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarAppearance />
        <User user={currentUser} />
      </SidebarFooter>
    </Sidebar>
  )
}

export default AppSidebar
