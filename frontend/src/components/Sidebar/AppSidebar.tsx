// [mcp-local harness] feature: recebimento-vale-gas | plano: 907fbb05 | 2026-09-05 22:37:52
// Adiciona Recebimento de Vale Gas no sidebar apos Bloco de Vale Gas
import {
  AlertTriangle,
  Banknote,
  Book,
  Box,
  Flame,
  HandCoins,
  Home,
  LayoutDashboard,
  ListChecks,
  MapPin,
  Moon,
  Package,
  PhoneCall,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sunrise,
  Ticket,
  Users,
  UsersRound,
  Wallet,
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
  { module: "vendas",        icon: ShoppingCart,  title: "Vendas",                   path: "/vendas" },
  { module: "vendas",        icon: HandCoins,     title: "Recebimento de Fiado",      path: "/recebimento-vale" },
  { module: "livro_vendas",  icon: Book,          title: "Livro de Vendas",           path: "/livro-vendas" },
  { module: "inadimplencia", icon: AlertTriangle, title: "Inadimplentes",             path: "/inadimplentes" },
  { module: "mapa",          icon: MapPin,        title: "Mapa",                      path: "/mapa" },
  { module: "delegacao",     icon: PhoneCall,     title: "Chamado",                   path: "/chamado" },
  { module: "delegacao", action: "can_delete", icon: ListChecks, title: "Chamados Ativos", path: "/chamados-ativos" },
  { module: "fechamento",    icon: Sunrise,       title: "Abertura do Dia",           path: "/abertura-dia" },
  { module: "fechamento",    icon: Moon,          title: "Fechamento do Dia",         path: "/fechamento-dia" },
  { module: "fechamento",    icon: LayoutDashboard, title: "Dashboard de Saldos",     path: "/dashboard-saldos" },
  { module: "produtos",      icon: Box,           title: "Produtos",                  path: "/produtos" },
  { module: "produtos",      icon: Banknote,      title: "Preços",                    path: "/precos" },
  { module: "clientes",      icon: UsersRound,    title: "Clientes",                  path: "/clientes" },
  { module: "vales",         icon: Ticket,        title: "Bloco de Fiados",           path: "/vales" },
  { module: "vale_gas",      icon: Flame,         title: "Bloco de Vale Gás",         path: "/vale-gas" },
  { module: "vale_gas",      icon: Wallet,        title: "Recebimento de Vale Gás",   path: "/recebimento-vale-gas" },
  { module: "usuarios",      icon: Users,         title: "Usuários",                  path: "/admin" },
  { module: "configuracoes", icon: Settings,      title: "Configurações",             path: "/settings" },
]

const ADMIN_ITEM: Item = { icon: Package, title: "Admin", path: "/admin" }
const PERMISSIONS_ITEM: Item = { icon: ShieldCheck, title: "Permissões", path: "/permissions" }

export function AppSidebar() {
  const { user: currentUser } = useAuth()
  const { canCreate, canRead, canUpdate, canDelete, isLoading } = usePermissions()

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
