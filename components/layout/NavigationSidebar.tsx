"use client";

import Link from "next/link";
import Image from "next/image";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Home,
  Layout,
  Package,
  Server,
  Database,
  Settings,
  Activity,
  Shield,
  Monitor,
  FolderOpen,
  ChevronRight,
  Workflow,
  Plus,
  Blocks,
  Container,
  Plug,
  Bell,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useSidebarStore } from "@/stores/SidebarStore";

const navItems = [
  {
    title: "Dashboard",
    icon: Home,
    href: "/dashboard",
  },
  {
    title: "Clusters",
    icon: Server,
    href: "/dashboard/clusters",
    submenu: [
      { title: "All Clusters", href: "/dashboard/clusters", icon: Server },
      { title: "Add Cluster", href: "/dashboard/clusters/new", icon: Package },
    ],
  },
  {
    title: "Workflow Designer",
    icon: Workflow,
    href: "/dashboard/workflow",
    submenu: [
      { title: "All Workflows", href: "/dashboard/workflow", icon: FolderOpen },
      { title: "New Workflow", href: "/dashboard/workflow/new", icon: Plus },
      {
        title: "Templates",
        href: "/dashboard/workflow/templates",
        icon: Layout,
      },
    ],
  },
  {
    title: "Resources",
    icon: Database,
    href: "/dashboard/resources",
  },
  {
    title: "Integrations",
    icon: Blocks,
    href: "/dashboard/integrations",
    submenu: [
      {
        title: "Registries",
        href: "/dashboard/integrations/registries",
        icon: Container,
      },
      { title: "Plugins", href: "/dashboard/integrations/plugins", icon: Plug },
      {
        title: "Notifications",
        href: "/dashboard/integrations/notifications",
        icon: Bell,
      },
    ],
  },
  {
    title: "Monitoring",
    icon: Monitor,
    href: "/dashboard/monitoring/metrics",
    submenu: [
      {
        title: "Metrics",
        href: "/dashboard/monitoring/metrics",
        icon: Activity,
      },
      { title: "Alerts", href: "/dashboard/monitoring/alerts", icon: Shield },
    ],
  },
  {
    title: "Settings",
    icon: Settings,
    href: "/dashboard/settings",
  },
];

export function NavigationSidebar() {
  const { openMenus, toggleMenu } = useSidebarStore();

  return (
    <SidebarProvider>
      <Sidebar className="border-r border-border bg-sidebar">
        <SidebarHeader className="border-b border-sidebar-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Image
              src="/navbar-logo.png"
              alt="KubeOrch Logo"
              width={32}
              height={32}
            />
            <span className="text-lg font-semibold text-sidebar-foreground">
              KubeOrch
            </span>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-xs uppercase text-sidebar-foreground/60">
              Navigation
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map(item => (
                  <SidebarMenuItem key={item.title}>
                    {item.submenu ? (
                      <Collapsible
                        open={openMenus[item.title]}
                        onOpenChange={() => toggleMenu(item.title)}
                      >
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="w-full">
                            <item.icon className="h-4 w-4" />
                            <span className="flex-1">{item.title}</span>
                            <ChevronRight
                              className={`h-4 w-4 transition-transform duration-200 ${
                                openMenus[item.title] ? "rotate-90" : ""
                              }`}
                            />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {item.submenu.map(subitem => (
                              <SidebarMenuSubItem key={subitem.title}>
                                <SidebarMenuSubButton asChild>
                                  <Link
                                    href={subitem.href}
                                    className="flex items-center gap-2"
                                  >
                                    <subitem.icon className="h-3 w-3" />
                                    <span>{subitem.title}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </Collapsible>
                    ) : (
                      <SidebarMenuButton asChild>
                        <Link
                          href={item.href}
                          className="flex items-center gap-2"
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-2 text-xs text-sidebar-foreground/60">
            <div
              className="h-2 w-2 rounded-full bg-sidebar-foreground/40"
              aria-hidden="true"
            />
            <span>Status not checked</span>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarTrigger className="fixed left-4 top-4 z-50 md:hidden" />
    </SidebarProvider>
  );
}
