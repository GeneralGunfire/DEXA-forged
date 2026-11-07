import type { ReactNode } from 'react'

const icon = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
)

export type Section = { path: string; label: string; blurb: string; icon: ReactNode }

export const SECTIONS: Section[] = [
  {
    path: 'messages', label: 'Message board',
    blurb: 'Announcements for the team, with text and images. Posts can be backdated.',
    icon: icon(<><path d="M4 5h16v11H9l-5 4V5z" /><path d="M8 9h8M8 12h5" /></>),
  },
  {
    path: 'databases', label: 'Database board',
    blurb: 'One card per database, with background, build record, development log and documents.',
    icon: icon(<><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>),
  },
  {
    path: 'branding', label: 'Branding',
    blurb: 'DEXA logos, images and videos, uploaded and labelled in one place.',
    icon: icon(<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="M21 16l-5-5-8 9" /></>),
  },
  {
    path: 'schedule', label: 'Schedule',
    blurb: 'Tasks and events, assigned to people, with due dates.',
    icon: icon(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  },
  {
    path: 'documents', label: 'Documents',
    blurb: 'PDF, Word, MP4, JPEG and PNG files, uploaded and named.',
    icon: icon(<><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></>),
  },
]

export const sectionByPath = (p: string) => SECTIONS.find((s) => s.path === p)!
