import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { unwrap, useLoad, useMe } from '../../../lib/data'
import { btn, dateTimeLabel, isOverdue, STATUS_LABEL, tone, type Ev, type Prompt } from '../calendar/cal'
import { ItemPanel } from '../calendar/ItemPanel'
import { TagPill } from '../calendar/Views'
import { cn } from '@/lib/utils'
import { Empty, Part } from './FormDialog'

/**
 * The gateway prompts for one database. They are written by the Claude chat, so this only reads and shows them.
 * Opening one shows the same side panel as the Calendar, so Copy, "I ran it" and Respond work from here.
 */
export function GatewayPrompts({ dbId, dbName }: { dbId: string; dbName: string }) {
  const me = useMe()
  const [openId, setOpenId] = useState<string | null>(null)
  const { data, error, loading, reload } = useLoad<{ events: Ev[]; prompts: Prompt[] }>(async () => {
    const events = unwrap<Ev[]>(await supabase.from('calendar_events').select('*').eq('kind', 'prompt').eq('workstream', 'gateway').eq('database_id', dbId).order('starts_at', { ascending: false })) ?? []
    if (events.length === 0) return { events, prompts: [] }
    const prompts = unwrap<Prompt[]>(await supabase.from('prompt_tasks').select('*').in('event_id', events.map((e) => e.id))) ?? []
    return { events, prompts }
  }, [dbId])

  const now = new Date()
  const events = data?.events ?? []
  const tag = (e: Ev) => data?.prompts.find((p) => p.event_id === e.id)?.tag
  const open = events.find((e) => e.id === openId) ?? null

  return (
    <Part
      id="prompts" title="Gateway prompts" count={events.length} hint="Prompts written for this database's gateway work. Open one to copy it, mark it run, or paste the response back."
      action={<button type="button" className={btn} onClick={reload} disabled={loading}><RefreshCw className={cn('size-4', loading && 'animate-spin')} aria-hidden="true" /> Refresh</button>}
    >
      {error ? <p className="text-sm text-destructive" role="alert">Could not load the prompts: {error}</p>
        : loading && !data ? <p className="text-sm text-muted-foreground">Loading…</p>
        : events.length === 0 ? <Empty>No gateway prompts for this database yet. The Claude chat adds them.</Empty>
        : (
          <ul className="divide-y divide-border border-y border-border">
            {events.map((e) => {
              const late = isOverdue(e, now)
              return (
                <li key={e.id}>
                  <button type="button" onClick={() => setOpenId(e.id)} className="group grid w-full items-center gap-x-4 gap-y-1 px-2 py-3 text-left transition-colors hover:bg-secondary/40 focus-visible:outline-2 focus-visible:outline-ring md:grid-cols-[4.5rem_minmax(0,1fr)_6rem_9rem_6.5rem]">
                    <span>{tag(e) ? <TagPill tag={tag(e)!} /> : <span className="text-xs text-muted-foreground">No tag</span>}</span>
                    <span className={cn('min-w-0 truncate text-sm font-medium text-foreground', e.status === 'cancelled' && 'line-through opacity-60')}>{e.title}</span>
                    <span className="text-xs text-muted-foreground">{e.assignee ?? 'Nobody'}</span>
                    <span className={cn('text-xs tabular-nums', late ? 'font-medium text-destructive' : 'text-muted-foreground')}>{dateTimeLabel(e.starts_at)}</span>
                    <span><span className={cn('inline-block rounded-full border px-2 text-[11px] font-medium leading-5', tone(e, now))}>{late ? 'Overdue' : STATUS_LABEL[e.status]}</span></span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      {open ? (
        <ItemPanel
          key={open.id} ev={open} prompt={data?.prompts.find((p) => p.event_id === open.id)} items={[]} people={[]} dbName={dbName} me={me}
          onClose={() => setOpenId(null)} onChanged={reload} onEdit={() => setOpenId(null)}
        />
      ) : null}
    </Part>
  )
}
