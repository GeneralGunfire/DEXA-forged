import { useMemo, useState } from 'react'
import { Check, ChevronRight, Copy, Search, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { fmtDate, unwrap, useLoad } from '../../../lib/data'
import { btn, field } from '../calendar/cal'
import { Rich } from '@/components/rich'
import { cn } from '@/lib/utils'
import type { Section } from './shared'

const KIND_LABEL: Record<Section['kind'], string> = { text: 'Text', sources: 'Sources', table: 'Table', chart: 'Chart', queries: 'Queries' }
const SEG = ['bg-primary', 'bg-accent', 'bg-muted-foreground/60', 'bg-primary/50', 'bg-border']
const num = (n: number) => n.toLocaleString('en-ZA')

/* ---------------- a table: searchable, pages of 100, sticky header and first column ---------------- */

type TableData = { columns: string[]; rows: unknown[][] }
const PAGE = 100

function TableView({ body }: { body: string }) {
  const t = useMemo<TableData | null>(() => {
    try { const o = JSON.parse(body) as TableData; return Array.isArray(o.columns) && Array.isArray(o.rows) ? o : null } catch { return null }
  }, [body])
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const rows = useMemo(() => {
    if (!t) return []
    const n = q.trim().toLowerCase()
    return n ? t.rows.filter((r) => r.some((c) => String(c ?? '').toLowerCase().includes(n))) : t.rows
  }, [t, q])
  if (!t) return <p className="text-sm text-muted-foreground">This table could not be shown.</p>
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input type="search" className={cn(field, 'h-9 pl-9 pr-8')} placeholder="Search this table" aria-label="Search this table" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE) }} />
          {q ? <button type="button" aria-label="Clear the search" onClick={() => setQ('')} className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="size-3.5" aria-hidden="true" /></button> : null}
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">{rows.length === t.rows.length ? `${num(rows.length)} rows` : `${num(rows.length)} of ${num(t.rows.length)} rows`} · {t.columns.length} columns</span>
      </div>
      {rows.length === 0 ? <p className="rounded-lg border border-border px-4 py-6 text-center text-sm text-muted-foreground">Nothing matches that search.</p> : (
        <div className="max-h-[30rem] overflow-auto rounded-lg border border-border">
          <table className="w-max min-w-full border-separate border-spacing-0 text-left text-[13px]">
            <thead>
              <tr>
                {t.columns.map((c, j) => (
                  <th key={`${c}-${j}`} scope="col" className={cn('sticky top-0 z-20 whitespace-nowrap border-b border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground', j === 0 && 'left-0 z-30')}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((r, i) => (
                <tr key={i} className="odd:bg-muted/20">
                  {r.map((c, j) => (
                    <td key={j} className={cn('min-w-[5rem] max-w-[26rem] break-words border-b border-border/60 px-3 py-2 align-top tabular-nums', j === 0 && 'sticky left-0 z-10 bg-background font-medium odd:bg-background')}>{String(c ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > limit ? <button type="button" className={cn(btn, 'mt-3 !h-8')} onClick={() => setLimit((n) => n + PAGE)}>Show {Math.min(PAGE, rows.length - limit)} more</button> : null}
    </div>
  )
}

/* ---------------- a chart written as content: bar, stacked, before-after ---------------- */

type Spec = { type: 'bar' | 'stacked' | 'before-after'; unit?: string; items: { label: string; value?: number; before?: number; after?: number }[] }

function ChartView({ body }: { body: string }) {
  let spec: Spec
  try { spec = JSON.parse(body) as Spec } catch { return <p className="text-sm text-muted-foreground">This chart could not be shown.</p> }
  if (!spec || !Array.isArray(spec.items) || spec.items.length === 0) return <p className="text-sm text-muted-foreground">This chart could not be shown.</p>
  const unit = spec.unit ?? ''
  const fmt = (n: number) => `${num(n)}${unit ? (unit === '%' ? '%' : ` ${unit}`) : ''}`

  if (spec.type === 'stacked') {
    const total = spec.items.reduce((a, i) => a + (i.value ?? 0), 0) || 1
    return (
      <div>
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={spec.items.map((i) => `${i.label} ${fmt(i.value ?? 0)}`).join(', ')}>
          {spec.items.map((i, k) => <span key={i.label} className={cn('h-full', SEG[k % SEG.length])} style={{ flex: Math.max(0.0001, i.value ?? 0) }} />)}
        </div>
        <ul className="mt-4 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
          {spec.items.map((i, k) => (
            <li key={i.label} className="flex items-center gap-2.5">
              <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', SEG[k % SEG.length])} />
              <span className="min-w-0 flex-1 truncate" title={i.label}>{i.label}</span>
              <span className="tabular-nums text-muted-foreground">{fmt(i.value ?? 0)} · {Math.round(((i.value ?? 0) / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (spec.type === 'before-after') {
    const max = Math.max(1, ...spec.items.flatMap((i) => [i.before ?? 0, i.after ?? 0]))
    return (
      <ul className="space-y-4">
        {spec.items.map((i) => (
          <li key={i.label}>
            <p className="mb-1.5 text-sm font-medium" title={i.label}>{i.label}</p>
            {[['Before', i.before ?? 0, 'bg-muted-foreground/50'], ['After', i.after ?? 0, 'bg-primary']].map(([k, v, c]) => (
              <div key={String(k)} className="mb-1 flex items-center gap-3 text-xs">
                <span className="w-12 shrink-0 text-muted-foreground">{k}</span>
                <span className="h-2 min-w-0 flex-1 rounded-full bg-secondary"><span className={cn('block h-full rounded-full', String(c))} style={{ width: `${(Number(v) / max) * 100}%` }} /></span>
                <span className="w-24 shrink-0 whitespace-nowrap text-right tabular-nums text-foreground">{fmt(Number(v))}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    )
  }

  const max = Math.max(1, ...spec.items.map((i) => i.value ?? 0))
  return (
    <ul className="space-y-2">
      {spec.items.map((i) => (
        <li key={i.label} className="flex items-center gap-3 text-sm">
          <span className="w-40 shrink-0 truncate sm:w-52" title={i.label}>{i.label}</span>
          <span className="h-2 min-w-0 flex-1 rounded-full bg-secondary"><span className="block h-full rounded-full bg-primary" style={{ width: `${((i.value ?? 0) / max) * 100}%` }} /></span>
          <span className="w-32 shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">{fmt(i.value ?? 0)}</span>
        </li>
      ))}
    </ul>
  )
}

function Queries({ body }: { body: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={async () => { try { await navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* the text can still be selected by hand */ } }}
        className={cn(btn, 'absolute right-2 top-2 !h-7 !px-2 text-xs')}
      >
        {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}{copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="max-h-96 overflow-auto rounded-lg border border-border bg-background p-4 pr-20 font-mono text-xs leading-5 text-foreground">{body}</pre>
    </div>
  )
}

/* ---------------- the list of sections ---------------- */

/** In-depth sections for one database and area. Titles, summaries and text are shown exactly as stored. */
export function InDepth({ databaseId, area, plain = false }: { databaseId: string | null; area: 'background' | 'build' | 'estate'; plain?: boolean }) {
  const { data, error, loading } = useLoad<Section[]>(async () => {
    let q = supabase.from('db_content').select('id, area, title, summary, kind, body, collapsed, position, updated_at, written_by').eq('area', area)
    q = databaseId ? q.eq('database_id', databaseId) : q.is('database_id', null) // null = the whole estate
    return unwrap<Section[]>(await q.order('position')) ?? []
  }, [databaseId, area])
  const [open, setOpen] = useState<Record<string, boolean>>({})
  if (error) return <p className="mt-10 text-sm text-destructive" role="alert">Could not load the in-depth detail: {error}</p>
  if (loading && !data) return <p className="mt-10 text-sm text-muted-foreground">Loading the in-depth detail…</p>
  if (!data || data.length === 0) return null
  const isOpen = (s: Section) => open[s.id] ?? !s.collapsed
  const allOpen = data.every(isOpen)
  const set = (v: boolean) => setOpen(Object.fromEntries(data.map((s) => [s.id, v])))

  return (
    <section aria-label="In depth" className="mt-12 border-t border-border pt-6">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">In depth <span className="ml-2 tabular-nums normal-case tracking-normal">{data.length} {data.length === 1 ? 'section' : 'sections'}</span></h2>
        <button type="button" className="text-xs text-muted-foreground transition-colors hover:text-foreground" onClick={() => set(!allOpen)}>{allOpen ? 'Collapse all' : 'Expand all'}</button>
      </div>
      <ul className="divide-y divide-border border-y border-border">
        {data.map((s) => {
          const on = isOpen(s)
          return (
            <li key={s.id}>
              <button type="button" aria-expanded={on} onClick={() => setOpen((o) => ({ ...o, [s.id]: !on }))} className="group flex w-full items-start gap-3 px-1 py-3.5 text-left transition-colors hover:bg-secondary/40 focus-visible:outline-2 focus-visible:outline-ring">
                <ChevronRight aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform', on && 'rotate-90')} />
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-medium leading-snug text-foreground">{s.title}</span>
                  {s.summary ? <span className="mt-1 block break-words text-xs leading-5 text-muted-foreground">{s.summary}</span> : null}
                </span>
                <span className="mt-0.5 shrink-0 rounded-full border border-border px-2 text-[11px] leading-5 text-muted-foreground">{KIND_LABEL[s.kind] ?? s.kind}</span>
              </button>
              {on ? (
                <div className="pb-6 pl-8 pr-1">
                  {s.kind === 'table' ? <TableView body={s.body} />
                    : s.kind === 'chart' ? <ChartView body={s.body} />
                    : s.kind === 'queries' ? <Queries body={s.body} />
                    : plain && (s.kind === 'text' || s.kind === 'sources') ? <p className="max-w-[72ch] whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">{s.body}</p>
                    : <Rich text={s.body} className="max-w-[72ch]" />}
                  <p className="mt-4 text-xs text-muted-foreground">Written by {s.written_by || 'Claude Code'}, updated {fmtDate(s.updated_at)}.</p>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
