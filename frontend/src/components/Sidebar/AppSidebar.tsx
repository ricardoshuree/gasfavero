// [mcp-local harness] feature: abertura-dia-frontend | plano: c2315bde | 2026-09-04 15:21:50
// Adiciona item Abertura do Dia no sidebar com ícone Sunrise, módulo fechamento
/**
 * AppSidebar — menu lateral dinâmico por módulo/role.
 *
 * Itens fixos (sempre visíveis para usuários autenticados):
 *   - Dashboard
 *
 * Itens controlados por módulo (visíveis se can_read, salvo os que
 * declaram "action" diferente -- ver campo `action` em MODULE_ITEMS):
 *   - Vendas              → módulo "vendas"
 *   - Recebimento de Vale → módulo "vendas"
 *   - Livro de Vendas     → módulo "livro_vendas"
 *   - Inadimplentes       → módulo "inadimplencia"
 *   - Mapa                → módulo "mapa"
 *   - Chamado             → módulo "delegacao"
 *   - Chamados Ativos     → módulo "delegacao", action "can_delete"
 *   - Abertura do Dia     → módulo "fechamento", action "can_read"
 *   - Produtos            → módulo "produtos"
 *   - Preços              → módulo "produtos"
 *   - Clientes            → módulo "clientes"
 *   - Bloco de Vale       → módulo "vales"
 *   - Usuários            → módulo "usuarios"
 *   - Configurações       → módulo "configuracoes"
 *
 * Itens exclusivos de superuser:
 *   - Admin
 *   - Permissões
 *
 * Plano futuro (quando fechamento do dia estiver pronto):
 *   Agrupar "Abertura do Dia" e "Fechamento do Dia" sob o grupo
 *   "Operação Diária" no sidebar.
 */

import {
  AlertTriangle,
  Banknote,
  Book,
  Box,
  HandCoins,
  Home,
  ListChecks,
  MapPin,
  Package,
  PhoneCall,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sunrise,
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

const FIXED_ITEMS: Item[] = [{ icon: Home, title: "Dashboard", path: "/" }]

type PermissionAction = "can_create" | "can_read" | "can_update" | "can_delete"

const MODULE_ITEMS: Array<Item & { module: string; action?: PermissionAction }> = [
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
  {
    module: "delegacao",
    action: "can_delete",
    icon: ListChecks,
    title: "Chamados Ativos",
    path: "/chamados-ativos",
  },
  {
    module: "fechamento",
    icon: Sunrise,
    title: "Abertura do Dia",
    path: "/abertura-dia",
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

const ADMIN_ITEM: Item = { icon: Package, title: "Admin", path: "/admin" }
const PERMISSIONS_ITEM: Item = {
  icon: ShieldCheck,
  title: "Permissões",
  path: "/permissions",
}

export function AppSidebar() {
  const { user: currentUser } = useAuth()
  const { canCreate, canRead, canUpdate, canDelete, isLoading } =
    usePermissions()

  const checkPermission = (module: string, action: PermissionAction) => {
    if (action === "can_create") return canCreate(module)
    if (action === "can_update") return canUpdate(module)
    if (action === "can_delete") return canDelete(module)
    return canRead(module)
  }

  const moduleItems: Item[] = isLoading
    ? []
    : MODULE_ITEMS.filter((item) =>
        checkPermission(item.module, item.action ?? "can_read"),
      )

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
