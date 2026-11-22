import { useEffect, useRef } from 'react'
import { Ban, Bell, Briefcase, Check, CheckCheck, CircleAlert, Flag, Hourglass, Phone, Sparkles, type LucideIcon } from 'lucide-react'
import {
  accent, addDays, byStart, endDay, isOverdue, longDay, minutesOfDay, monthWeeks, onDay as fallsOn, shortDay,
  startDay, STATUS_LABEL, timeLabel, todayKey, tone, weekday, weekdayShort, type Ev,
} from './cal'
import { cn } from '@/lib/utils'

const CATEGORY: Record<string, LucideIcon> = { call: Phone, deadline: Flag, reminder: Bell, work: Briefcase }
export type Tags = Record<string, string> // event id -> P-tag

type Common = { events: Ev[]; tags: Tags; now: Date; onOpen: (id: string) => void }

/** The little icon that says what an item is, or what state a prompt is in. */
function iconFor(ev: Ev, now: Date): LucideIcon {
  if (ev.status === 'cancelled') return Ban
  if (ev.kind === 'event') return CATEGORY[ev.category ?? 'work'] ?? Briefcase
  if (isOverdue(ev, now)) return CircleAlert
  return ev.status === 'reviewed' ? CheckCheck : ev.status === 'done' ? Check : ev.status === 'ran' ? Hourglass : Sparkles
}

/** A prompt's tag, as a tidy pill that never squashes the title. */
export function TagPill({ tag, className }: { tag: string; className?: string }) {
  return <span className={cn('shrink-0 rounded border border-border bg-background/60 px-1.5 text-[10px] font-medium leading-[16px] tabular-nums text-muted-foreground', className)}>{tag}</span>
}

const range = (e: Ev) => (e.all_day ? 'All day' : e.ends_at ? `${timeLabel(e.starts_at)} – ${timeLabel(e.ends_at)}` : timeLabel(e.starts_at))

/**
 * One calendar item. "line" is a single row (month cells, all-day strip). "block" fills a slot in the week and day
 * grids: two lines when it is tall enough (title, then time and tag), one line when it is short.
 */
function Chip({ ev, tags, now, onOpen, block = false, h = 0, showTime = true, showTag = true, meta = true }: { ev: Ev; block?: boolean; h?: number; showTime?: boolean; showTag?: boolean; meta?: boolean } & Omit<Common, 'events'>) {
  const Icon = iconFor(ev, now)
  const tag = tags[ev.id]
  const late = isOverdue(ev, now)
  const base = 'group/chip flex w-full min-w-0 rounded-md border text-left text-xs transition-[filter,box-shadow] hover:brightness-125 focus-visible:outline-2 focus-visible:outline-ring'
  const icon = <Icon aria-hidden="true" className={cn('size-3.5 shrink-0', accent(ev, now))} />
  const label = `${ev.title}${tag ? `, ${tag}` : ''}, ${range(ev)}${late ? ', overdue' : ev.status !== 'scheduled' ? `, ${STATUS_LABEL[ev.status].toLowerCase()}` : ''}`

  if (!block || h < 44 || (!meta && h < 44)) {
    return (
      <button type="button" onClick={() => onOpen(ev.id)} title={label} aria-label={label} className={cn(base, 'items-center gap-1.5 px-1.5', block ? 'h-full' : 'py-1', tone(ev, now))}>
        {icon}
        {showTime && !ev.all_day ? <span className="shrink-0 tabular-nums text-muted-foreground">{timeLabel(ev.starts_at)}</span> : null}
        <span className="min-w-0 flex-1 truncate font-medium">{ev.title}</span>
        {tag && showTag ? <TagPill tag={tag} /> : null}
      </button>
    )
  }
  return (
    <button type="button" onClick={() => onOpen(ev.id)} title={label} aria-label={label} className={cn(base, 'h-full flex-col gap-1 overflow-hidden px-2 py-1.5', tone(ev, now))}>
      <span className="flex w-full min-w-0 items-start gap-1.5">
        <span className="mt-px">{icon}</span>
        <span className={cn('min-w-0 flex-1 font-medium leading-snug', !meta ? 'line-clamp-3' : h >= 100 ? 'line-clamp-3' : h >= 76 ? 'line-clamp-2' : 'line-clamp-1')}>{ev.title}</span>
      </span>
      {meta ? <span className="flex w-full min-w-0 items-center gap-1.5 pl-5 text-[11px] text-muted-foreground">
        <span className="min-w-0 truncate tabular-nums">{range(ev)}</span>
        {late ? <span className="shrink-0 font-medium text-destructive">Overdue</span> : null}
        {tag ? <TagPill tag={tag} className="ml-auto" /> : null}
      </span> : null}
    </button>
  )
}

/* ---------------- month ---------------- */

export function MonthView({ cursor, events, tags, now, onOpen, onDay }: Common & { cursor: string; onDay: (key: string) => void }) {
  const weeks = monthWeeks(cursor)
  const today = todayKey()
  const month = cursor.slice(0, 7)
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-7 border-b border-border bg-muted/30 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {weeks[0].map((d) => <div key={d} className="px-3 py-2">{weekdayShort(d)}</div>)}
        </div>
        <div className="divide-y divide-border">
          {weeks.map((w) => (
            <div key={w[0]} className="grid min-h-32 grid-cols-7 divide-x divide-border">
              {w.map((d) => {
                const list = events.filter((e) => fallsOn(e, d)).sort(byStart)
                const dim = !d.startsWith(month)
                return (
                  <div key={d} className={cn('flex min-w-0 flex-col gap-1 p-1.5', dim && 'bg-muted/30', d === today && 'bg-primary/[0.05]')}>
                    <button
                      type="button"
                      onClick={() => onDay(d)}
                      className={cn(
                        'grid size-6 place-items-center self-start rounded-full text-xs tabular-nums text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
                        d === today && 'bg-primary font-semibold text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground',
                        dim && d !== today && 'opacity-50',
                      )}
                      aria-label={longDay(d)}
                    >
                      {+d.slice(8)}
                    </button>
                    {list.slice(0, 3).map((e) => <Chip key={e.id} ev={e} tags={tags} now={now} onOpen={onOpen} showTag={false} />)}
                    {list.length > 3 ? (
                      <button type="button" onClick={() => onDay(d)} className="rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                        +{list.length - 3} more
                      </button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ---------------- week and day (time grid) ---------------- */

const HOUR = 56 // px per hour

/** Lay out overlapping timed events side by side. */
function layout(list: Ev[], key: string) {
  const items = list
    .map((e) => {
      const s = startDay(e) < key ? 0 : minutesOfDay(e.starts_at)
      let end = e.ends_at ? (endDay(e) > key ? 1440 : minutesOfDay(e.ends_at)) : s + 60
      if (end <= s) end = Math.min(1440, s + 30)
      return { e, s, end: Math.min(1440, Math.max(end, s + 30)), col: 0, cols: 1 }
    })
    .sort((a, b) => a.s - b.s || b.end - a.end)
  const groups: (typeof items)[] = []
  let current: typeof items = []
  let groupEnd = -1
  for (const it of items) {
    if (current.length && it.s >= groupEnd) { groups.push(current); current = []; groupEnd = -1 }
    current.push(it); groupEnd = Math.max(groupEnd, it.end)
  }
  if (current.length) groups.push(current)
  for (const g of groups) {
    const ends: number[] = []
    for (const it of g) {
      let c = ends.findIndex((x) => x <= it.s)
      if (c === -1) { c = ends.length; ends.push(it.end) } else ends[c] = it.end
      it.col = c
    }
    for (const it of g) it.cols = ends.length
  }
  return items
}

export function TimeGrid({ days, events, tags, now, onOpen, onDay, onSlot }: Common & { days: string[]; onDay?: (key: string) => void; onSlot?: (key: string, hhmm: string) => void }) {
  const scroller = useRef<HTMLDivElement>(null)
  const today = todayKey()
  const cols = `60px repeat(${days.length}, minmax(0, 1fr))`
  const nowMin = minutesOfDay(now)
  const showNow = days.includes(today)
  // open scrolled to the current time when today is showing, otherwise to the start of the working day
  const head = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!scroller.current) return
    const line = showNow ? Math.max(0, Math.floor(nowMin / 60) - 2) : 7 // an hour line to sit just under the header
    scroller.current.scrollTop = Math.max(0, line * HOUR - (head.current?.offsetHeight ?? 90) - 14)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0], days.length])
  // ONE scroll container (both directions); the day headers stay put at the top of it
  return (
    <div ref={scroller} className="h-full min-h-72 overflow-auto rounded-lg border border-border">
      <div className={days.length > 1 ? 'min-w-[860px]' : ''}>
        <div ref={head} className="sticky top-0 z-30 border-b border-border bg-background">
          <div className="grid" style={{ gridTemplateColumns: cols }}>
            <div />
            {days.map((d) => (
              <div key={d} className="px-2 py-2.5 text-center">
                <button
                  type="button"
                  disabled={!onDay}
                  onClick={() => onDay?.(d)}
                  className={cn('inline-flex items-center gap-2 rounded-md px-2 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground', onDay && 'transition-colors hover:text-foreground')}
                >
                  {weekdayShort(d)}
                  <span className={cn('inline-grid size-7 place-items-center rounded-full text-sm normal-case tracking-normal tabular-nums', d === today ? 'bg-primary font-semibold text-primary-foreground' : 'text-foreground')}>
                    {+d.slice(8)}
                  </span>
                </button>
              </div>
            ))}
          </div>
          {events.some((e) => e.all_day) ? (
            <div className="grid border-t border-border" style={{ gridTemplateColumns: cols }}>
              <div className="py-2 pr-2 text-right text-[10px] uppercase tracking-[0.12em] text-muted-foreground">All day</div>
              {days.map((d) => (
                <div key={d} className="flex flex-col gap-1 border-l border-border p-1">
                  {events.filter((e) => e.all_day && fallsOn(e, d)).map((e) => <Chip key={e.id} ev={e} tags={tags} now={now} onOpen={onOpen} showTime={false} />)}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="relative grid" style={{ gridTemplateColumns: cols, height: HOUR * 24 }}>
          <div className="relative">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="absolute right-2.5 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground" style={{ top: h * HOUR }}>
                {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </div>
            ))}
            {showNow ? (
              <div className="pointer-events-none absolute right-1 z-20 -translate-y-1/2 rounded bg-primary px-1 text-[10px] font-semibold tabular-nums leading-4 text-primary-foreground" style={{ top: (nowMin / 60) * HOUR }}>
                {timeLabel(now)}
              </div>
            ) : null}
          </div>
          {days.map((d) => {
            const placed = layout(events.filter((e) => !e.all_day && fallsOn(e, d)), d)
            return (
              <div
                key={d}
                className={cn('relative border-l border-border', d === today ? 'bg-primary/[0.04]' : weekday(d) >= 5 && 'bg-muted/30', onSlot && 'cursor-cell')}
                onClick={(e) => {
                  if (!onSlot || (e.target as HTMLElement).closest('button')) return
                  const y = e.clientY - e.currentTarget.getBoundingClientRect().top
                  const mins = Math.min(23 * 60 + 30, Math.floor((y / HOUR) * 2) * 30)
                  onSlot(d, `${String(Math.floor(mins / 60)).padStart(2, '0')}:${mins % 60 === 0 ? '00' : '30'}`)
                }}
              >
                {Array.from({ length: 24 }, (_, h) => <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-border/50" style={{ top: h * HOUR }} />)}
                {d === today ? <div className="pointer-events-none absolute inset-x-0 z-[5] border-t border-primary/70" style={{ top: (nowMin / 60) * HOUR }} /> : null}
                {placed.map(({ e, s, end, col, cols: n }) => {
                  const height = Math.max(26, ((end - s) / 60) * HOUR - 3)
                  return (
                    <div
                      key={e.id}
                      className="absolute z-10 px-[3px]"
                      style={{ top: (s / 60) * HOUR + 1, height, left: `${(col / n) * 100}%`, width: `${100 / n}%` }}
                    >
                      <div className="h-full rounded-md bg-background">
                        <Chip ev={e} tags={tags} now={now} onOpen={onOpen} block h={height} meta={!(n > 1 && days.length > 1)} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ---------------- today list ---------------- */

function Pill({ children, tone: t = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'bad' | 'blue' }) {
  return (
    <span className={cn('shrink-0 rounded-full border px-2 text-[11px] font-medium leading-5', t === 'bad' ? 'border-destructive/50 bg-destructive/10 text-foreground' : t === 'blue' ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-border text-muted-foreground')}>
      {children}
    </span>
  )
}

function Row({ ev, tags, now, onOpen, when }: { ev: Ev; when: string } & Omit<Common, 'events'>) {
  const Icon = iconFor(ev, now)
  const overdue = isOverdue(ev, now)
  const kind = ev.kind === 'prompt' ? 'Prompt' : ev.category ? ev.category[0].toUpperCase() + ev.category.slice(1) : 'Event'
  return (
    <li>
      <button type="button" onClick={() => onOpen(ev.id)} className="group/row flex w-full items-center gap-4 rounded-md px-2 py-3 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-2 focus-visible:outline-ring">
        <span className={cn('w-24 shrink-0 text-xs font-medium tabular-nums', overdue ? 'text-destructive' : 'text-muted-foreground')}>{when}</span>
        <Icon aria-hidden="true" className={cn('size-4 shrink-0', accent(ev, now))} />
        <span className={cn('min-w-0 flex-1', ev.status === 'cancelled' && 'line-through opacity-60')}>
          <span className="block truncate text-sm font-medium text-foreground">{ev.title}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{[kind, ev.assignee].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {tags[ev.id] ? <TagPill tag={tags[ev.id]} /> : null}
          {overdue ? <Pill tone="bad">Overdue</Pill> : ev.status !== 'scheduled' ? <Pill tone={ev.status === 'ran' ? 'blue' : 'plain'}>{STATUS_LABEL[ev.status]}</Pill> : null}
        </span>
      </button>
    </li>
  )
}

export function TodayList({ events, tags, now, onOpen }: Common) {
  const today = todayKey()
  const live = events.filter((e) => e.status !== 'cancelled')
  const overdue = live.filter((e) => isOverdue(e, now) && startDay(e) < today).sort(byStart)
  const todays = events.filter((e) => fallsOn(e, today) && !overdue.includes(e)).sort(byStart)
  const soon = live.filter((e) => startDay(e) > today && startDay(e) <= addDays(today, 7)).sort(byStart)
  const block = (title: string, list: Ev[], when: (e: Ev) => string, empty: string) => (
    <section className="border-t border-border pt-5">
      <h2 className="mb-2 px-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{title} <span className="ml-1 tabular-nums normal-case tracking-normal">{list.length}</span></h2>
      {list.length ? <ul className="divide-y divide-border/60">{list.map((e) => <Row key={e.id} ev={e} when={when(e)} tags={tags} now={now} onOpen={onOpen} />)}</ul> : <p className="px-2 py-3 text-sm text-muted-foreground">{empty}</p>}
    </section>
  )
  return (
    <div className="flex flex-col gap-8">
      <p className="px-2 text-sm text-muted-foreground">{longDay(today)}</p>
      {overdue.length ? block('Overdue', overdue, (e) => shortDay(startDay(e)), '') : null}
      {block('Today', todays, (e) => (e.all_day ? 'All day' : timeLabel(e.starts_at)), 'Nothing is scheduled for today.')}
      {block('Coming up this week', soon, (e) => `${shortDay(startDay(e))}${e.all_day ? '' : ' ' + timeLabel(e.starts_at)}`, 'Nothing else this week.')}
    </div>
  )
}
