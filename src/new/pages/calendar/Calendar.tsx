import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { unwrap, useLoad, useMe } from '../../../lib/data'
import {
  addDays, addMonths, btn, btnPrimary, longDay, monthLabel, shortDay, startOfWeek, todayKey,
  type Db, type Ev, type Item, type Person, type Prompt,
} from './cal'
import { MonthView, TimeGrid, TodayList } from './Views'
import { EventEditor } from './EventEditor'
import { ItemPanel } from './ItemPanel'
import { cn } from '@/lib/utils'
import { Loading } from '@/components/ui/loading'

type View = 'month' | 'week' | 'day' | 'today'
type Data = { events: Ev[]; prompts: Prompt[]; people: Person[]; items: Item[]; dbs: Db[] }
const VIEWS: { id: View; label: string }[] = [
  { id: 'month', label: 'Month' }, { id: 'week', label: 'Week' }, { id: 'day', label: 'Day' }, { id: 'today', label: 'Today' },
]

export default function Calendar() {
  const me = useMe()
  const [view, setView] = useState<View>('month')
  const [cursor, setCursor] = useState(todayKey())
  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Ev | 'new' | null>(null)
  const [slot, setSlot] = useState<string | null>(null) // 'YYYY-MM-DDTHH:mm' picked by clicking the grid
  const [now, setNow] = useState(() => new Date())

  // everything the calendar needs, read with the signed-in person's own session
  const { data, error, loading, reload } = useLoad<Data>(async () => {
    const [events, prompts, people, items, dbs] = await Promise.all([
      supabase.from('calendar_events').select('*').order('starts_at', { ascending: true }),
      supabase.from('prompt_tasks').select('*'),
      supabase.from('calendar_event_people').select('*'),
      supabase.from('calendar_checklist_items').select('*'),
      supabase.from('databases').select('id, name').order('name'),
    ])
    return {
      events: unwrap<Ev[]>(events) ?? [], prompts: unwrap<Prompt[]>(prompts) ?? [], people: unwrap<Person[]>(people) ?? [],
      items: unwrap<Item[]>(items) ?? [], dbs: unwrap<Db[]>(dbs) ?? [],
    }
  })

  // refresh when the window regains focus, and keep "now" current for overdue and the time line
  const reloadRef = useRef(reload)
  reloadRef.current = reload
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') { setNow(new Date()); reloadRef.current() } }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    const tick = setInterval(() => setNow(new Date()), 60000)
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); clearInterval(tick) }
  }, [])

  const events = data?.events ?? []
  const tags = useMemo(() => Object.fromEntries((data?.prompts ?? []).map((p) => [p.event_id, p.tag])), [data])
  const open = events.find((e) => e.id === openId) ?? null

  const step = (n: number) => setCursor((c) => (view === 'month' ? addMonths(c, n) : view === 'week' ? addDays(c, 7 * n) : addDays(c, n)))
  const range =
    view === 'month' ? monthLabel(cursor)
    : view === 'week' ? `${shortDay(startOfWeek(cursor))} to ${shortDay(addDays(startOfWeek(cursor), 6))}`
    : view === 'day' ? longDay(cursor) : 'Today'
  const common = { events, tags, now, onOpen: setOpenId }

  const grid = view === 'week' || view === 'day'
  return (
    <div className={cn('mx-auto flex w-full max-w-7xl flex-col px-5 sm:px-8', grid ? 'h-[calc(100svh-3.5rem)] pb-5 pt-6' : 'pb-16 pt-8 sm:pt-10')}>
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Admin</p>
          <h1 className={cn("mt-2 font-semibold tracking-tight", grid ? "text-2xl" : "text-3xl sm:text-4xl")}>Calendar</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">All times are Johannesburg time.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className={btn} onClick={reload} disabled={loading}>
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} aria-hidden="true" /> Refresh
          </button>
          <button type="button" className={btnPrimary} onClick={() => { setSlot(null); setEditing('new') }}><Plus className="size-4" aria-hidden="true" /> New event</button>
        </div>
      </header>

      <div className={cn("flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border pt-4", grid ? "mt-4" : "mt-8")}>
        <div className="flex items-center gap-2">
          {view !== 'today' ? (
            <>
              <button type="button" className={btn + ' !px-2'} onClick={() => step(-1)} aria-label="Previous"><ChevronLeft className="size-4" aria-hidden="true" /></button>
              <button type="button" className={btn + ' !px-2'} onClick={() => step(1)} aria-label="Next"><ChevronRight className="size-4" aria-hidden="true" /></button>
              <button type="button" className={btn} onClick={() => setCursor(todayKey())}>Today</button>
            </>
          ) : null}
          <h2 className="ml-2 text-lg font-semibold tracking-tight">{range}</h2>
        </div>
        <div className="inline-flex rounded-md border border-border p-0.5" role="tablist" aria-label="Calendar view">
          {VIEWS.map((v) => (
            <button
              key={v.id} type="button" role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)}
              className={cn('h-8 rounded px-3 text-sm font-medium transition-colors', view === v.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("mt-4", grid && "min-h-0 flex-1")}>
        {error ? (
          <p className="text-sm text-destructive" role="alert">Could not load the calendar: {error}</p>
        ) : loading && !data ? (
          <Loading variant="rows" />
        ) : view === 'month' ? (
          <MonthView {...common} cursor={cursor} onDay={(k) => { setCursor(k); setView('day') }} />
        ) : view === 'week' ? (
          <TimeGrid {...common} days={Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i))} onDay={(k) => { setCursor(k); setView('day') }} onSlot={(k, t) => { setSlot(`${k}T${t}`); setEditing('new') }} />
        ) : view === 'day' ? (
          <TimeGrid {...common} days={[cursor]} onSlot={(k, t) => { setSlot(`${k}T${t}`); setEditing('new') }} />
        ) : (
          <TodayList {...common} />
        )}
      </div>

      {open ? (
        <ItemPanel
          key={open.id}
          ev={open}
          prompt={data?.prompts.find((p) => p.event_id === open.id)}
          items={data?.items ?? []}
          people={data?.people ?? []}
          dbName={data?.dbs.find((d) => d.id === open.database_id)?.name}
          me={me}
          onClose={() => setOpenId(null)}
          onChanged={reload}
          onEdit={() => { setEditing(open); setOpenId(null) }}
        />
      ) : null}

      {editing ? (
        <EventEditor
          event={editing === 'new' ? null : editing}
          day={cursor}
          startAt={slot ?? undefined}
          people={data?.people ?? []}
          items={data?.items ?? []}
          dbs={data?.dbs ?? []}
          onClose={() => { setEditing(null); setSlot(null) }}
          onSaved={(id) => { setEditing(null); setSlot(null); reload(); setOpenId(id) }}
        />
      ) : null}
    </div>
  )
}
