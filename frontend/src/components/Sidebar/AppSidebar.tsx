// [mcp-local harness] feature: sidebar-grupos | plano: a23f2512 | 2026-09-05 22:48:52
// Organiza sidebar em grupos: Vendas, Vale Gas, Operacoes, Cadastros, Administracao
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
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import useAuth from "@/hooks/useAuth"
import { usePermissions } from "@/hooks/usePermissions"
import { type Item, type ItemGroup, Main } from "./Main"
import { User } from "./User"

type PermissionAction = "can_create" | "can_read" | "can_update" | "can_delete"

type ModuleItem = Item & { module: string; action?: PermissionAction }

// ---------------------------------------------------------------------------
// Definição dos grupos e seus itens com módulo RBAC
// ---------------------------------------------------------------------------

type ModuleGroup = {
  label: string
  items: ModuleItem[]
}

const MODULE_GROUPS: ModuleGroup[] = [
  {
    label: "Vendas",
    items: [
      { module: "vendas",        icon: ShoppingCart, title: "Vendas",                path: "/vendas" },
      { module: "vendas",        icon: HandCoins,    title: "Recebimento de Fiado",   path: "/recebimento-vale" },
      { module: "livro_vendas",  icon: Book,         title: "Livro de Vendas",        path: "/livro-vendas" },
      { module: "inadimplencia", icon: AlertTriangle, title: "Inadimplentes",         path: "/inadimplentes" },
    ],
  },
  {
    label: "Vale Gás",
    items: [
      { module: "vale_gas", icon: Flame,  title: "Bloco de Vale Gás",        path: "/vale-gas" },
      { module: "vale_gas", icon: Wallet, title: "Recebimento de Vale Gás",  path: "/recebimento-vale-gas" },
    ],
  },
  {
    label: "Operações",
    items: [
      { module: "fechamento", icon: Sunrise,         title: "Abertura do Dia",     path: "/abertura-dia" },
      { module: "fechamento", icon: Moon,            title: "Fechamento do Dia",   path: "/fechamento-dia" },
      { module: "fechamento", icon: LayoutDashboard, title: "Dashboard de Saldos", path: "/dashboard-saldos" },
      { module: "mapa",       icon: MapPin,          title: "Mapa",                path: "/mapa" },
      { module: "delegacao",  icon: PhoneCall,       title: "Chamado",             path: "/chamado" },
      { module: "delegacao",  action: "can_delete" as PermissionAction, icon: ListChecks, title: "Chamados Ativos", path: "/chamados-ativos" },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { module: "produtos",  icon: Box,       title: "Produtos",       path: "/produtos" },
      { module: "produtos",  icon: Banknote,  title: "Preços",         path: "/precos" },
      { module: "clientes",  icon: UsersRound, title: "Clientes",      path: "/clientes" },
      { module: "vales",     icon: Ticket,    title: "Bloco de Fiados", path: "/vales" },
    ],
  },
  {
    label: "Administração",
    items: [
      { module: "usuarios",      icon: Users,       title: "Usuários",      path: "/admin" },
      { module: "configuracoes", icon: Settings,    title: "Configurações", path: "/settings" },
    ],
  },
]

export function AppSidebar() {
  const { user: currentUser } = useAuth()
  const { canCreate, canRead, canUpdate, canDelete, isLoading } = usePermissions()

  const checkPermission = (module: string, action: PermissionAction) => {
    if (action === "can_create") return canCreate(module)
    if (action === "can_update") return canUpdate(module)
    if (action === "can_delete") return canDelete(module)
    return canRead(module)
  }

  const groups: ItemGroup[] = isLoading
    ? []
    : MODULE_GROUPS.map((group) => ({
        label: group.label,
        items: group.items.filter((item) =>
          checkPermission(item.module, item.action ?? "can_read")
        ),
      }))

  // Itens de superuser ficam no grupo Administração
  if (currentUser?.is_superuser) {
    const adminGroup = groups.find((g) => g.label === "Administração")
    if (adminGroup) {
      if (!adminGroup.items.find((i) => i.path === "/admin" && i.title === "Admin")) {
        adminGroup.items.push({ icon: Package,     title: "Admin",      path: "/admin" })
      }
      adminGroup.items.push({ icon: ShieldCheck, title: "Permissões", path: "/permissions" })
    }
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-6 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:items-center">
        <Logo variant="responsive" />
      </SidebarHeader>
      <SidebarContent>
        {/* Dashboard fora dos grupos — sempre visível */}
        <SidebarMenu className="px-2 py-1">
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Dashboard" isActive={false} asChild>
              <a href="/">
                <Home />
                <span>Dashboard</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <Main groups={groups} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarAppearance />
        <User user={currentUser} />
      </SidebarFooter>
    </Sidebar>
  )
}

export default AppSidebar
