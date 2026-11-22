// Types, Africa/Johannesburg date helpers and status rules for the New Forge calendar.
// Johannesburg is UTC+2 all year (no daylight saving), so a wall-clock time there is always "+02:00".

export const TZ = 'Africa/Johannesburg'
export const PEOPLE = ['Rajen', 'Huzayfa'] as const
export const CATEGORIES = ['call', 'deadline', 'reminder', 'work'] as const

export type Status = 'scheduled' | 'ran' | 'done' | 'reviewed' | 'cancelled'
export type Ev = {
  id: string; kind: 'event' | 'prompt'; category: string | null; title: string; notes: string
  starts_at: string; ends_at: string | null; all_day: boolean; assignee: string | null
  status: Status; database_id: string | null; cancelled_at: string | null; workstream?: 'general' | 'gateway'
}
export type Prompt = {
  id: string; event_id: string; tag: string; prompt_text: string; paste_back: string
  ran_at: string | null; ran_by: string | null; done_at: string | null; done_by: string | null
  reviewed_at: string | null; review_note: string
}
export type Resp = { id: string; prompt_id: string; body: string; responded_by: string | null; created_at: string }
export type Person = { event_id: string; person: string }
export type Item = { id: string; event_id: string; text: string; position: number; done_at: string | null; done_by: string | null }
export type Db = { id: string; name: string }

/* ---------- dates (all in Johannesburg) ---------- */

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
})
export function parts(d: Date | string) {
  const o: Record<string, string> = {}
  for (const p of partsFmt.formatToParts(typeof d === 'string' ? new Date(d) : d)) o[p.type] = p.value
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute }
}
const two = (n: number) => String(n).padStart(2, '0')
export const dayKey = (d: Date | string) => { const p = parts(d); return `${p.y}-${two(p.m)}-${two(p.d)}` }
export const todayKey = () => dayKey(new Date())
export const minutesOfDay = (d: Date | string) => { const p = parts(d); return p.h * 60 + p.mi }
export const timeLabel = (d: Date | string) => { const p = parts(d); return `${two(p.h)}:${two(p.mi)}` }

const utc = (key: string) => new Date(key + 'T00:00:00Z')
export const addDays = (key: string, n: number) => { const d = utc(key); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
/** Monday = 0 … Sunday = 6 */
export const weekday = (key: string) => (utc(key).getUTCDay() + 6) % 7
export const startOfWeek = (key: string) => addDays(key, -weekday(key))
export const monthStart = (key: string) => key.slice(0, 8) + '01'
export const addMonths = (key: string, n: number) => {
  const d = utc(monthStart(key)); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10)
}
/** The weeks (Monday first) that cover the month of `key`. */
export function monthWeeks(key: string): string[][] {
  const first = monthStart(key)
  const last = addDays(addMonths(first, 1), -1)
  const weeks: string[][] = []
  for (let s = startOfWeek(first); s <= last; s = addDays(s, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(s, i)))
  return weeks
}
/** A Johannesburg wall-clock moment as an instant. */
export const instant = (key: string, hhmm = '00:00') => new Date(`${key}T${hhmm}:00+02:00`)

const dayFmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-ZA', { timeZone: 'UTC', ...o })
export const longDay = (key: string) => dayFmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(utc(key))
export const shortDay = (key: string) => dayFmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(utc(key))
export const monthLabel = (key: string) => dayFmt({ month: 'long', year: 'numeric' }).format(utc(key))
export const weekdayShort = (key: string) => dayFmt({ weekday: 'short' }).format(utc(key))
export const dateTimeLabel = (iso: string) => `${shortDay(dayKey(iso))}, ${timeLabel(iso)}`

/** Value for <input type="datetime-local"> (Johannesburg wall time). */
export const toInput = (iso: string) => `${dayKey(iso)}T${timeLabel(iso)}`
export const fromInput = (v: string) => new Date(v + ':00+02:00').toISOString()

/* ---------- which events fall on which day ---------- */

export const startDay = (e: Ev) => dayKey(e.starts_at)
export function endDay(e: Ev) {
  if (!e.ends_at) return startDay(e)
  const k = dayKey(e.ends_at)
  // an event that ends exactly at midnight belongs to the day before
  return k > startDay(e) && minutesOfDay(e.ends_at) === 0 ? addDays(k, -1) : k < startDay(e) ? startDay(e) : k
}
export const onDay = (e: Ev, key: string) => startDay(e) <= key && key <= endDay(e)
export const byStart = (a: Ev, b: Ev) => (a.all_day === b.all_day ? a.starts_at.localeCompare(b.starts_at) : a.all_day ? -1 : 1)

/* ---------- status ---------- */

/** Prompt items that are scheduled or ran and are past their start time are overdue. */
export const isOverdue = (e: Ev, now = new Date()) =>
  e.kind === 'prompt' && (e.status === 'scheduled' || e.status === 'ran') && new Date(e.starts_at) < now

export const STATUS_LABEL: Record<Status, string> = {
  scheduled: 'Scheduled', ran: 'Ran', done: 'Done', reviewed: 'Reviewed', cancelled: 'Cancelled',
}

/**
 * How an item looks: a soft tint and a full outline, never a coloured bar on one side. Text stays readable
 * (white or grey), and only the small icon carries the colour. Palette only: blue, navy, greys, red for problems.
 */
export function tone(e: Ev, now = new Date()) {
  if (e.status === 'cancelled') return 'border-border bg-muted/60 text-muted-foreground line-through'
  if (isOverdue(e, now)) return 'border-destructive/50 bg-destructive/10 text-foreground'
  if (e.kind === 'prompt') {
    if (e.status === 'ran') return 'border-primary/50 bg-accent/50 text-foreground'
    if (e.status === 'done') return 'border-border bg-secondary/70 text-muted-foreground'
    if (e.status === 'reviewed') return 'border-foreground/25 bg-secondary text-foreground'
    return 'border-primary/40 bg-primary/10 text-foreground'
  }
  return 'border-border bg-secondary text-foreground'
}

/** Colour of the small icon on an item. */
export function accent(e: Ev, now = new Date()) {
  if (e.status === 'cancelled') return 'text-muted-foreground'
  if (isOverdue(e, now)) return 'text-destructive'
  if (e.kind === 'prompt' && (e.status === 'scheduled' || e.status === 'ran')) return 'text-primary'
  return 'text-muted-foreground'
}

/** What a person should read when the database says no. */
export function plainError(e: unknown): string {
  const x = e as { message?: string; code?: string } | null
  const m = (x?.message ?? '').trim()
  if (x?.code === '42501' || /not a team member|row-level security/i.test(m)) return 'Only team members can do this. Sign in again and try once more.'
  if (/failed to fetch|network/i.test(m)) return 'Could not reach the server. Check your connection and try again.'
  return m || 'Something went wrong. Please try again.'
}

/* ---------- shared look ---------- */

export const btn = 'inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50'
export const btnPrimary = 'inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50'
export const btnGhost = 'inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50'
export const field = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring'
export const label = 'mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground'
