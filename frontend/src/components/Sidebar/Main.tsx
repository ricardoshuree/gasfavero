// [mcp-local harness] feature: panel-cancelar-edicao | plano: 17e37098 | 2026-09-06 01:19:04
// Usa text-primary nos SidebarGroupLabel em vez de cor hardcoded
import { Link as RouterLink, useRouterState } from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

export type Item = {
  icon: LucideIcon
  title: string
  path: string
}

export type ItemGroup = {
  label: string
  items: Item[]
}

interface MainProps {
  groups: ItemGroup[]
}

export function Main({ groups }: MainProps) {
  const { isMobile, setOpenMobile } = useSidebar()
  const router = useRouterState()
  const currentPath = router.location.pathname

  const handleMenuClick = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <>
      {groups.map((group) => {
        if (group.items.length === 0) return null
        return (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-primary">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = currentPath === item.path
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        tooltip={item.title}
                        isActive={isActive}
                        asChild
                      >
                        <RouterLink to={item.path} onClick={handleMenuClick}>
                          <item.icon />
                          <span>{item.title}</span>
                        </RouterLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )
      })}
    </>
  )
}
