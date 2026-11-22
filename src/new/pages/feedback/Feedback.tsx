import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Inbox, RefreshCw, Search, Star } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { describe, fmtDate, unwrap, useLoad } from '../../../lib/data'
import { btn, btnPrimary, field, label } from '../calendar/cal'
import { cn } from '@/lib/utils'

// Everything in a feedback row came from outside (anonymous inserts are allowed), so it is shown as plain text only.
export type Row = {
  id: string; source: 'explorer' | 'forged' | 'other'; page: string; rating: number | null; message: string
  contact: string; tags: string[]; status: 'new' | 'reviewing' | 'done'; note: string; created_at: string
}
const STATUSES: { v: Row['status']; t: string }[] = [{ v: 'new', t: 'New' }, { v: 'reviewing', t: 'Reviewing' }, { v: 'done', t: 'Done' }]
const SOURCES = ['explorer', 'forged', 'other'] as const
const DAYS = [{ v: 0, t: 'Any time' }, { v: 7, t: 'Last 7 days' }, { v: 30, t: 'Last 30 days' }]

const ago = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 60) return `${m} min ago`
  if (m < 1440) return `${Math.round(m / 60)} h ago`
  if (m < 20160) return `${Math.round(m / 1440)} d ago`
  return fmtDate(iso)
}

const statusTone = (s: Row['status']) =>
  s === 'new' ? 'border-primary bg-primary/15 text-primary' : s === 'reviewing' ? 'border-primary bg-accent text-accent-foreground' : 'border-border bg-secondary text-muted-foreground'

const Stars = ({ n }: { n: number | null }) => (
  <span className="inline-flex gap-0.5" aria-label={n ? `${n} out of 5` : 'No rating'}>
    {[1, 2, 3, 4, 5].map((i) => <Star key={i} aria-hidden="true" className={cn('size-3.5', n && i <= n ? 'fill-primary text-primary' : 'text-border')} />)}
  </span>
)

function Seg<T extends string | number>({ value, onChange, options, name }: { value: T; onChange: (v: T) => void; options: { v: T; t: string }[]; name: string }) {
  return (
    <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label={name}>
      {options.map((o) => (
        <button key={String(o.v)} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)}
          className={cn('h-8 rounded px-3 text-sm font-medium transition-colors', value === o.v ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          {o.t}
        </button>
      ))}
    </div>
  )
}

export default function Feedback() {
  const { data, error, loading, reload } = useLoad<Row[]>(async () =>
    unwrap<Row[]>(await supabase.from('feedback').select('*').order('created_at', { ascending: false })) ?? [])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'all' | Row['status']>('all')
  const [source, setSource] = useState<'all' | Row['source']>('all')
  const [rating, setRating] = useState<'all' | 'high' | 'low'>('all')
  const [days, setDays] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)

  const all = data ?? []
  const rows = useMemo(() => {
    const cutoff = days ? Date.now() - days * 86400000 : 0
    const needle = q.trim().toLowerCase()
    return all.filter((f) =>
      (status === 'all' || f.status === status) && (source === 'all' || f.source === source) &&
      (rating === 'all' || (rating === 'high' ? (f.rating ?? 0) >= 4 : f.rating != null && f.rating <= 2)) &&
      (!cutoff || new Date(f.created_at).getTime() >= cutoff) &&
      (!needle || `${f.message} ${f.page} ${f.contact} ${f.tags.join(' ')} ${f.note}`.toLowerCase().includes(needle)))
  }, [all, q, status, source, rating, days])

  const rated = all.filter((f) => f.rating != null) as (Row & { rating: number })[]
  const avg = rated.length ? rated.reduce((s, f) => s + f.rating, 0) / rated.length : null
  const open = all.find((f) => f.id === openId) ?? null
  const filtered = q || status !== 'all' || source !== 'all' || rating !== 'all' || days > 0

  return (
    <div className="mx-auto w-full max-w-7xl px-5 pb-24 pt-8 sm:px-8 sm:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Admin</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Feedback</h1>
          <p className="mt-2 text-sm text-muted-foreground">Messages sent from the public explorer and from Forged, newest first.</p>
        </div>
        <button type="button" className={btn} onClick={reload} disabled={loading}><RefreshCw className={cn('size-4', loading && 'animate-spin')} aria-hidden="true" /> Refresh</button>
      </header>

      {error ? (
        <p className="mt-10 text-sm text-destructive" role="alert">Could not load the feedback: {error}</p>
      ) : loading && !data ? (
        <p className="mt-10 text-sm text-muted-foreground">Loading…</p>
      ) : all.length === 0 ? (
        <div className="mt-10 border-t border-border py-20 text-center">
          <Inbox className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-4 text-lg font-medium">No feedback yet.</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            When someone sends feedback from the public explorer or from Forged, it arrives here with its rating, page and message, and you can search it, filter it and mark it as reviewed.
          </p>
        </div>
      ) : (
        <>
          <dl className="mt-10 grid grid-cols-2 gap-x-10 gap-y-6 border-t border-border pt-6 sm:grid-cols-4">
            {[
              { k: 'Responses', v: all.length },
              { k: 'New, not yet read', v: all.filter((f) => f.status === 'new').length },
              { k: 'Reviewing', v: all.filter((f) => f.status === 'reviewing').length },
              { k: 'Average rating', v: avg != null ? avg.toFixed(1) : '–' },
            ].map((s) => (
              <div key={s.k}>
                <dt className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{s.k}</dt>
                <dd className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{s.v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-6">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input className={field + ' pl-9'} type="search" placeholder="Search messages, pages, tags and notes" aria-label="Search feedback" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Seg name="Status" value={status} onChange={setStatus} options={[{ v: 'all', t: 'All' }, ...STATUSES]} />
            <Seg name="Source" value={source} onChange={setSource} options={[{ v: 'all', t: 'Any source' }, ...SOURCES.map((s) => ({ v: s, t: s[0].toUpperCase() + s.slice(1) }))]} />
            <Seg name="Rating" value={rating} onChange={setRating} options={[{ v: 'all', t: 'Any rating' }, { v: 'high', t: '4–5' }, { v: 'low', t: '1–2' }]} />
            <Seg name="Date" value={days} onChange={setDays} options={DAYS} />
          </div>

          <div className="mt-6 grid gap-0 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
            <ul className={cn('divide-y divide-border border-y border-border', open && 'hidden lg:block')}>
              {rows.length === 0 ? (
                <li className="py-12 text-center text-sm text-muted-foreground">Nothing matches. Clear the search or the filters.</li>
              ) : rows.map((f) => (
                <li key={f.id}>
                  <button type="button" onClick={() => setOpenId(f.id)} aria-current={openId === f.id}
                    className={cn('block w-full px-3 py-4 text-left transition-colors hover:bg-muted/50', openId === f.id && 'bg-muted')}>
                    <span className="flex items-center gap-3">
                      <Stars n={f.rating} />
                      <span className={cn('rounded border px-1.5 text-[11px] font-medium', statusTone(f.status))}>{STATUSES.find((s) => s.v === f.status)?.t}</span>
                      <time className="ml-auto text-xs text-muted-foreground" dateTime={f.created_at}>{ago(f.created_at)}</time>
                    </span>
                    <span className="mt-2 line-clamp-2 block text-sm text-foreground">{f.message || <span className="text-muted-foreground">No message</span>}</span>
                    <span className="mt-1.5 block truncate text-xs text-muted-foreground">{[f.source, f.page].filter(Boolean).join(' · ')}</span>
                  </button>
                </li>
              ))}
            </ul>

            <div className={cn(!open && 'hidden lg:block')}>
              {open ? <Detail key={open.id} row={open} onBack={() => setOpenId(null)} onSaved={reload} />
                : <p className="hidden border-y border-border py-12 text-center text-sm text-muted-foreground lg:block">{filtered ? `${rows.length} shown. ` : ''}Choose a message to read it.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Detail({ row, onBack, onSaved }: { row: Row; onBack: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState(row.status)
  const [tags, setTags] = useState(row.tags.join(', '))
  const [note, setNote] = useState(row.note)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  useEffect(() => setMsg(null), [status, tags, note])
  const dirty = status !== row.status || tags !== row.tags.join(', ') || note !== row.note

  async function save() {
    setBusy(true)
    try {
      const list = tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 12)
      unwrap(await supabase.from('feedback').update({ status, tags: list, note: note.slice(0, 2000) }).eq('id', row.id))
      onSaved()
      setMsg({ ok: true, t: 'Saved.' })
    } catch (e) {
      setMsg({ ok: false, t: describe(e) })
    } finally { setBusy(false) }
  }

  return (
    <section aria-label="Feedback detail" className="border-y border-border py-6 lg:px-2">
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground lg:hidden"><ArrowLeft className="size-4" aria-hidden="true" /> Back to the list</button>
      <div className="flex flex-wrap items-center gap-3">
        <Stars n={row.rating} />
        <span className="text-sm text-muted-foreground">{row.rating ? `${row.rating} out of 5` : 'No rating'}</span>
        <time className="ml-auto text-xs text-muted-foreground" dateTime={row.created_at}>{fmtDate(row.created_at)}, {new Date(row.created_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' })}</time>
      </div>

      <p className="mt-5 whitespace-pre-wrap break-words text-base leading-7 text-foreground">{row.message || <span className="text-muted-foreground">No message was left.</span>}</p>

      <dl className="mt-6 divide-y divide-border border-y border-border text-sm">
        {[['Source', row.source], ['Page', row.page || '–'], ['Contact left', row.contact || 'None']].map(([k, v]) => (
          <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 py-2.5">
            <dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="f-status">Status</label>
          <select id="f-status" className={field} value={status} onChange={(e) => setStatus(e.target.value as Row['status'])}>
            {STATUSES.map((s) => <option key={s.v} value={s.v}>{s.t}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="f-tags">Tags</label>
          <input id="f-tags" className={field} value={tags} maxLength={200} onChange={(e) => setTags(e.target.value)} placeholder="Comma separated, e.g. map, bug" />
        </div>
      </div>
      <div className="mt-5">
        <label className={label} htmlFor="f-note">Private note</label>
        <textarea id="f-note" className={field + ' min-h-24 resize-y'} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="mt-5 flex items-center gap-3">
        <button type="button" className={btnPrimary} disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button>
        {msg ? <span className={cn('text-sm', msg.ok ? 'text-muted-foreground' : 'text-destructive')} role={msg.ok ? 'status' : 'alert'}>{msg.t}</span> : null}
      </div>
    </section>
  )
}
