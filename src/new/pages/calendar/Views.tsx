import { useEffect, useRef } from 'react'
import { Bell, Briefcase, Flag, Phone, Sparkles, type LucideIcon } from 'lucide-react'
import {
  addDays, byStart, endDay, isOverdue, longDay, minutesOfDay, monthWeeks, onDay as fallsOn, shortDay,
  startDay, timeLabel, todayKey, tone, weekday, weekdayShort, type Ev,
} from './cal'
import { cn } from '@/lib/utils'

const ICON: Record<string, LucideIcon> = { call: Phone, deadline: Flag, reminder: Bell, work: Briefcase, prompt: Sparkles }
export type Tags = Record<string, string> // event id -> P-tag

type Common = { events: Ev[]; tags: Tags; now: Date; onOpen: (id: string) => void }

/** One calendar item: a coloured chip with a P-tag for prompts and a small icon for the category. */
function Chip({ ev, tags, now, onOpen, showTime = true, className }: { ev: Ev; showTime?: boolean; className?: string } & Omit<Common, 'events'>) {
  const Icon = ICON[ev.kind === 'prompt' ? 'prompt' : ev.category ?? 'work'] ?? Briefcase
  const tag = tags[ev.id]
  return (
    <button
      type="button"
      onClick={() => onOpen(ev.id)}
      title={ev.title}
      className={cn('flex w-full min-w-0 items-center gap-1.5 rounded-md border-l-2 px-1.5 py-1 text-left text-xs transition-opacity hover:opacity-80', tone(ev, now), className)}
    >
      <Icon aria-hidden="true" className="size-3 shrink-0" />
      {showTime && !ev.all_day ? <span className="shrink-0 tabular-nums opacity-80">{timeLabel(ev.starts_at)}</span> : null}
      <span className="min-w-0 flex-1 truncate font-medium">{ev.title}</span>
      {tag ? <span className="shrink-0 rounded bg-background/40 px-1 text-[10px] font-semibold tabular-nums">{tag}</span> : null}
    </button>
  )
}

/* ---------------- month ---------------- */

export function MonthView({ cursor, events, tags, now, onOpen, onDay }: Common & { cursor: string; onDay: (key: string) => void }) {
  const weeks = monthWeeks(cursor)
  const today = todayKey()
  const month = cursor.slice(0, 7)
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-7 border-b border-border pb-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {weeks[0].map((d) => <div key={d} className="px-2">{weekdayShort(d)}</div>)}
        </div>
        <div className="divide-y divide-border">
          {weeks.map((w) => (
            <div key={w[0]} className="grid min-h-28 grid-cols-7 divide-x divide-border">
              {w.map((d) => {
                const list = events.filter((e) => fallsOn(e, d)).sort(byStart)
                const dim = !d.startsWith(month)
                return (
                  <div key={d} className={cn('flex min-w-0 flex-col gap-1 p-1.5', dim && 'bg-muted/40')}>
                    <button
                      type="button"
                      onClick={() => onDay(d)}
                      className={cn(
                        'grid size-6 place-items-center self-start rounded-full text-xs tabular-nums text-muted-foreground hover:bg-muted hover:text-foreground',
                        d === today && 'bg-primary font-semibold text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground',
                        dim && d !== today && 'opacity-50',
                      )}
                      aria-label={longDay(d)}
                    >
                      {+d.slice(8)}
                    </button>
                    {list.slice(0, 3).map((e) => <Chip key={e.id} ev={e} tags={tags} now={now} onOpen={onOpen} />)}
                    {list.length > 3 ? (
                      <button type="button" onClick={() => onDay(d)} className="px-1.5 text-left text-xs text-muted-foreground hover:text-foreground">
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

const HOUR = 52 // px per hour

/** Lay out overlapping timed events side by side. */
function layout(list: Ev[], key: string) {
  const items = list
    .map((e) => {
      const s = startDay(e) < key ? 0 : minutesOfDay(e.starts_at)
      let end = e.ends_at ? (endDay(e) > key ? 1440 : minutesOfDay(e.ends_at)) : s + 60
      if (end <= s) end = Math.min(1440, s + 30)
      return { e, s, end: Math.min(1440, Math.max(end, s + 25)), col: 0, cols: 1 }
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
  const cols = `56px repeat(${days.length}, minmax(0, 1fr))`
  const nowMin = minutesOfDay(now)
  // open scrolled to the current time when today is showing, otherwise to the start of the working day
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = HOUR * (days.includes(today) ? Math.max(0, nowMin / 60 - 2.5) : 6.5)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0], days.length])
  // ONE scroll container (both directions); the day headers stay put at the top of it
  return (
    <div ref={scroller} className="h-full min-h-72 overflow-auto rounded-lg border border-border">
      <div className={days.length > 1 ? 'min-w-[820px]' : ''}>
        <div className="sticky top-0 z-20 bg-background">
          <div className="grid border-b border-border" style={{ gridTemplateColumns: cols }}>
            <div />
            {days.map((d) => (
              <div key={d} className="px-2 py-2 text-center">
                <button
                  type="button"
                  disabled={!onDay}
                  onClick={() => onDay?.(d)}
                  className={cn('rounded-md px-2 py-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground', onDay && 'hover:text-foreground')}
                >
                  {weekdayShort(d)}{' '}
                  <span className={cn('ml-1 inline-grid size-6 place-items-center rounded-full text-sm normal-case tracking-normal tabular-nums', d === today ? 'bg-primary font-semibold text-primary-foreground' : 'text-foreground')}>
                    {+d.slice(8)}
                  </span>
                </button>
              </div>
            ))}
          </div>
          {events.some((e) => e.all_day) ? (
            <div className="grid border-b border-border" style={{ gridTemplateColumns: cols }}>
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
              <div key={h} className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground" style={{ top: h * HOUR }}>
                {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </div>
            ))}
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
                {Array.from({ length: 24 }, (_, h) => <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-border/60" style={{ top: h * HOUR }} />)}
                {d === today ? (
                  <div className="absolute inset-x-0 z-10 border-t-2 border-primary" style={{ top: (nowMin / 60) * HOUR }}>
                    <span className="absolute -left-1 -top-[5px] size-2 rounded-full bg-primary" />
                  </div>
                ) : null}
                {placed.map(({ e, s, end, col, cols: n }) => (
                  <div
                    key={e.id}
                    className="absolute px-0.5"
                    style={{ top: (s / 60) * HOUR, height: Math.max(22, ((end - s) / 60) * HOUR - 2), left: `${(col / n) * 100}%`, width: `${100 / n}%` }}
                  >
                    <Chip ev={e} tags={tags} now={now} onOpen={onOpen} className="h-full items-start" />
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ---------------- today list ---------------- */

function Row({ ev, tags, now, onOpen, when }: { ev: Ev; when: string } & Omit<Common, 'events'>) {
  const Icon = ICON[ev.kind === 'prompt' ? 'prompt' : ev.category ?? 'work'] ?? Briefcase
  const overdue = isOverdue(ev, now)
  return (
    <li>
      <button type="button" onClick={() => onOpen(ev.id)} className="flex w-full items-start gap-4 py-3.5 text-left transition-colors hover:bg-muted/40">
        <span className={cn('mt-0.5 w-24 shrink-0 text-xs font-medium tabular-nums', overdue ? 'text-destructive' : 'text-muted-foreground')}>{when}</span>
        <span className={cn('min-w-0 flex-1', ev.status === 'cancelled' && 'line-through opacity-60')}>
          <span className="flex items-center gap-2">
            <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-medium text-foreground">{ev.title}</span>
            {tags[ev.id] ? <span className="rounded bg-secondary px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">{tags[ev.id]}</span> : null}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {[ev.kind === 'prompt' ? 'Prompt' : ev.category, ev.assignee, overdue ? 'Overdue' : ev.status !== 'scheduled' ? ev.status : null].filter(Boolean).join(' · ')}
          </span>
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
    <section className="border-t border-border pt-6">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{title}</h2>
      {list.length ? <ul className="divide-y divide-border">{list.map((e) => <Row key={e.id} ev={e} when={when(e)} tags={tags} now={now} onOpen={onOpen} />)}</ul> : <p className="py-3 text-sm text-muted-foreground">{empty}</p>}
    </section>
  )
  return (
    <div className="flex flex-col gap-10">
      <p className="text-sm text-muted-foreground">{longDay(today)}</p>
      {overdue.length ? block('Overdue', overdue, (e) => shortDay(startDay(e)), '') : null}
      {block('Today', todays, (e) => (e.all_day ? 'All day' : timeLabel(e.starts_at)), 'Nothing is scheduled for today.')}
      {block('Coming up this week', soon, (e) => `${shortDay(startDay(e))}${e.all_day ? '' : ' ' + timeLabel(e.starts_at)}`, 'Nothing else this week.')}
    </div>
  )
}

