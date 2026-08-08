// [mcp-local harness] feature: item16-chamados-ativos | plano: a49dfdf1 | 2026-08-08 14:23:10
// Suporte a gate por acao especifica (action opcional em MODULE_ITEMS, default can_read) + item "Chamados Ativos" gateado por can_delete
/**
 * AppSidebar — menu lateral dinâmico por módulo/role.
 *
 * Itens fixos (sempre visíveis para usuários autenticados):
 *   - Dashboard
 *
 * Itens controlados por módulo (visíveis se can_read, salvo os que
 * declaram "action" diferente -- ver campo `action` em MODULE_ITEMS):
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
 *   - Chamados Ativos    → módulo "delegacao", action "can_delete"
 *                           (NÃO "can_read"!). Motorista tem Ver+
 *                           Editar em delegacao mas não Apagar --
 *                           gatear por delete aqui é o que garante
 *                           que só quem pode cancelar/reatribuir
 *                           (Admin/Gerente/Operador) enxerga essa
 *                           tela de gestão. Ver comentário completo
 *                           em routes/_layout/chamados-ativos.tsx.
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
 *      (por padrão can_read -- declare `action` se precisar de outra)
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

type PermissionAction = "can_create" | "can_read" | "can_update" | "can_delete"

// Mapeamento de módulo → item de menu. `action` é opcional --
// omitido, o padrão é "can_read" (como sempre foi); declare
// explicitamente quando o item precisa de um nível de permissão
// diferente (ex: Chamados Ativos exige can_delete, não só can_read).
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
  const { canCreate, canRead, canUpdate, canDelete, isLoading } =
    usePermissions()

  const checkPermission = (module: string, action: PermissionAction) => {
    if (action === "can_create") return canCreate(module)
    if (action === "can_update") return canUpdate(module)
    if (action === "can_delete") return canDelete(module)
    return canRead(module)
  }

  // Monta os itens de menu de acordo com as permissões
  const moduleItems: Item[] = isLoading
    ? [] // não mostra nada enquanto carrega — evita flash de itens
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
