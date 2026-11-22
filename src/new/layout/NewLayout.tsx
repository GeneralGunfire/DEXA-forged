import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Home, LogOut, PanelLeft, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useRole } from '../../lib/data'
import {
  AnimatedSidebar, AnimatedSidebarClose, AnimatedSidebarContent, AnimatedSidebarFooter, AnimatedSidebarGroup,
  AnimatedSidebarGroupContent, AnimatedSidebarGroupLabel, AnimatedSidebarHeader, AnimatedSidebarInset,
  AnimatedSidebarMenu, AnimatedSidebarMenuButton, AnimatedSidebarMenuItem, AnimatedSidebarMenuSub,
  AnimatedSidebarMenuSubButton, AnimatedSidebarMenuSubItem, AnimatedSidebarProvider, AnimatedSidebarRail,
  AnimatedSidebarTrigger,
} from '@/components/ui/animated-sidebar'
import { useProfile } from '../lib/profile'
import { ALL_LEAVES, GROUPS } from './nav'
import './newforge.css'

const RAIL = 'forged_nf_open'

export default function NewLayout({ name }: { name: string }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { isAdmin } = useRole()
  const profile = useProfile()
  // a record page such as /new/documentation/databases/<id> keeps its menu item selected
  const onItem = (to: string) => pathname === to || pathname.startsWith(to + '/')
  const activeGroup = GROUPS.find((g) => g.items.some((i) => onItem(i.to)))?.id ?? null
  const [openSection, setOpenSection] = useState<string | null>(activeGroup) // one group open at a time
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(RAIL) !== '0' } catch { return true } })

  // the current page's group stays open
  useEffect(() => { if (activeGroup) setOpenSection(activeGroup) }, [activeGroup])

  const remember = (next: boolean) => {
    setOpen(next)
    try { localStorage.setItem(RAIL, next ? '1' : '0') } catch { /* storage blocked */ }
  }
  const title = pathname === '/new' ? 'Home' : ALL_LEAVES.find((l) => onItem(l.to))?.label ?? 'New Forge'

  return (
    <div className="nf" id="nf-root">
      <AnimatedSidebarProvider open={open} onOpenChange={remember} className="h-svh min-h-0">
        <AnimatedSidebar ariaLabel="New Forge menu" collapsible="icon" className="min-h-0" panelClassName="h-full">
          <AnimatedSidebarHeader className="p-3 pb-2">
            <div className="flex min-h-11 items-center gap-3 overflow-hidden px-2">
              <img src="/dexa-logo-navy.png" alt="DEXA" className="h-5 w-auto shrink-0 invert brightness-0 group-data-[state=collapsed]/sidebar:hidden" />
              <span className="rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground group-data-[state=collapsed]/sidebar:hidden">
                New Forge
              </span>
              <AnimatedSidebarClose className="ml-auto text-muted-foreground hover:bg-muted md:hidden">
                <X aria-hidden="true" className="size-4" />
              </AnimatedSidebarClose>
            </div>
          </AnimatedSidebarHeader>

          <AnimatedSidebarContent className="px-2 pt-1">
            <AnimatedSidebarGroup className="pt-1">
              <AnimatedSidebarGroupLabel>Main</AnimatedSidebarGroupLabel>
              <AnimatedSidebarGroupContent>
                <AnimatedSidebarMenu>
                  <AnimatedSidebarMenuItem>
                    <AnimatedSidebarMenuButton
                      icon={<Home className="size-4" />}
                      isActive={pathname === '/new'}
                      onSelect={() => { setOpenSection(null); navigate('/new') }}
                    >
                      Home
                    </AnimatedSidebarMenuButton>
                  </AnimatedSidebarMenuItem>
                  {GROUPS.map((g) => (
                    <AnimatedSidebarMenuItem key={g.id}>
                      <AnimatedSidebarMenuButton
                        icon={<g.icon className="size-4" />}
                        isActive={activeGroup === g.id}
                        ariaExpanded={openSection === g.id}
                        onSelect={() => setOpenSection((cur) => (cur === g.id ? null : g.id))}
                      >
                        {g.label}
                      </AnimatedSidebarMenuButton>
                      <AnimatedSidebarMenuSub open={openSection === g.id}>
                        {g.items.map((i) => (
                          <AnimatedSidebarMenuSubItem key={i.to}>
                            <AnimatedSidebarMenuSubButton isActive={onItem(i.to)} onSelect={() => navigate(i.to)}>
                              {i.label}
                            </AnimatedSidebarMenuSubButton>
                          </AnimatedSidebarMenuSubItem>
                        ))}
                      </AnimatedSidebarMenuSub>
                    </AnimatedSidebarMenuItem>
                  ))}
                </AnimatedSidebarMenu>
              </AnimatedSidebarGroupContent>
            </AnimatedSidebarGroup>
          </AnimatedSidebarContent>

          <AnimatedSidebarFooter className="gap-1 border-none p-3">
            <AnimatedSidebarMenu>
              <AnimatedSidebarMenuItem>
                <AnimatedSidebarMenuButton icon={<ArrowLeft className="size-4" />} onSelect={() => navigate('/app')}>
                  Back to Old Forge
                </AnimatedSidebarMenuButton>
              </AnimatedSidebarMenuItem>
              <AnimatedSidebarMenuItem>
                <AnimatedSidebarMenuButton icon={<LogOut className="size-4" />} onSelect={() => supabase.auth.signOut()}>
                  Sign out
                </AnimatedSidebarMenuButton>
              </AnimatedSidebarMenuItem>
            </AnimatedSidebarMenu>
            <div className="mt-1 flex min-h-11 items-center gap-3 overflow-hidden rounded-xl p-1">
              <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="size-full object-cover" /> : name.charAt(0)}
              </span>
              <span className="min-w-0 flex-1 group-data-[state=collapsed]/sidebar:hidden">
                <span className="block truncate text-sm font-medium text-foreground">{name}</span>
                <span className="block truncate text-xs text-muted-foreground">{profile.status || (isAdmin ? 'Admin' : 'Member')}</span>
              </span>
            </div>
          </AnimatedSidebarFooter>

          <AnimatedSidebarRail />
        </AnimatedSidebar>

        <AnimatedSidebarInset className="h-svh min-h-0 overflow-y-auto bg-background">
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur">
            <AnimatedSidebarTrigger className="text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <PanelLeft aria-hidden="true" className="size-4" />
            </AnimatedSidebarTrigger>
            <div className="h-5 w-px bg-border" />
            <p className="text-sm font-medium text-foreground">{title}</p>
          </header>
          <Outlet />
        </AnimatedSidebarInset>
      </AnimatedSidebarProvider>
    </div>
  )
}
