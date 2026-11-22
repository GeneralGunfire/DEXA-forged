import {
  Bell, BookOpen, Briefcase, CalendarDays, Database, FileText, FolderOpen, Globe2, Image, LayoutGrid,
  ListChecks, MessageSquareHeart, Settings, Sparkles, TriangleAlert, Waypoints, type LucideIcon,
} from 'lucide-react'

export type NavLeaf = { label: string; to: string; icon: LucideIcon }
export type NavGroup = { id: string; label: string; icon: LucideIcon; items: NavLeaf[] }

export const GROUPS: NavGroup[] = [
  {
    id: 'admin', label: 'Admin', icon: LayoutGrid,
    items: [
      { label: 'Calendar', to: '/new/admin/calendar', icon: CalendarDays },
      { label: 'Announcements', to: '/new/admin/announcements', icon: Bell },
      { label: 'Branding', to: '/new/admin/branding', icon: Image },
      { label: 'Feedback', to: '/new/admin/feedback', icon: MessageSquareHeart },
      { label: 'Settings', to: '/new/admin/settings', icon: Settings },
    ],
  },
  {
    id: 'documentation', label: 'Documentation', icon: BookOpen,
    items: [
      { label: 'Databases', to: '/new/documentation/databases', icon: Database },
      { label: 'Estate overview', to: '/new/documentation/estate-overview', icon: Globe2 },
      { label: 'Documents', to: '/new/documentation/documents', icon: FolderOpen },
      { label: 'Reports', to: '/new/documentation/reports', icon: FileText },
    ],
  },
  {
    id: 'work', label: 'Work', icon: Briefcase,
    items: [
      { label: 'Tracker', to: '/new/work/tracker', icon: ListChecks },
      { label: 'Prompts', to: '/new/work/prompts', icon: Sparkles },
      { label: 'Timeline', to: '/new/work/timeline', icon: Waypoints },
      { label: 'Errors', to: '/new/work/errors', icon: TriangleAlert },
    ],
  },
]

export const ALL_LEAVES = GROUPS.flatMap((g) => g.items)
