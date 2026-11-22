import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { unwrap, useLoad } from '../../../lib/data'
import { TimelineTab } from '../databases/TimelineTab'
import { ago, type Db, type Entry } from '../databases/shared'
import { GatewayPrompts } from './GatewayPrompts'
import { Empty, Part } from './FormDialog'
import { summarise } from './shared'

type Mini = { id: string; name: string }

export default function ProgressDb() {
  const { id = '' } = useParams()
  const [entries, setEntries] = useState<Entry[]>([])
  const one = useLoad<Db | null>(async () => unwrap<Db | null>(await supabase.from('databases').select('*').eq('id', id).maybeSingle()), [id])
  const sibs = useLoad<Mini[]>(async () => unwrap<Mini[]>(await supabase.from('databases').select('id, name').order('name')) ?? [])
  const list = sibs.data ?? []
  const at = list.findIndex((x) => x.id === id)
  const prev = at > 0 ? list[at - 1] : null
  const next = at >= 0 && at < list.length - 1 ? list[at + 1] : null
  const db = one.data

  if (!one.loading && !one.error && db === null) return <Navigate to="/new/work/progress" replace />

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-20 pt-6 sm:px-8 sm:pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link to="/new/work/progress" className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" /> All progress</Link>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {prev ? <Link to={`/new/work/progress/${prev.id}`} title={`Previous: ${prev.name}`} className="inline-flex max-w-[11rem] items-center gap-1 rounded-md px-2 py-1 hover:bg-secondary hover:text-foreground"><ChevronLeft className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{prev.name}</span></Link> : null}
          {next ? <Link to={`/new/work/progress/${next.id}`} title={`Next: ${next.name}`} className="inline-flex max-w-[11rem] items-center gap-1 rounded-md px-2 py-1 hover:bg-secondary hover:text-foreground"><span className="truncate">{next.name}</span><ChevronRight className="size-3.5 shrink-0" aria-hidden="true" /></Link> : null}
        </span>
      </div>

      {one.error ? <p className="mt-8 text-sm text-destructive" role="alert">Could not load this database: {one.error}</p>
        : one.loading && !db ? <p className="mt-8 text-sm text-muted-foreground">Loading…</p>
        : db ? (
          <>
            <header className="mt-5">
              <h1 className="break-words text-3xl font-semibold tracking-tight sm:text-4xl">{db.name}</h1>
              <p className="mt-2 text-sm text-muted-foreground">Phase 2 progress: what has been tried, what worked, what did not, and the prompts for this database.</p>
            </header>
            <div className="mt-8 space-y-12">
              <Summary entries={entries} />
              <GatewayPrompts dbId={db.id} dbName={db.name} />
              <Part id="timeline" title="Phase 2 timeline" hint="Everything logged for this database in Phase 2. Add entries, respond to errors, and mark them resolved here.">
                <TimelineTab db={db} onlyPhase="2" onLoaded={setEntries} />
              </Part>
            </div>
          </>
        ) : null}
    </div>
  )
}

/** Shows what works and what did not (the rule lives in `summarise`). */
function Summary({ entries }: { entries: Entry[] }) {
  const { worked, failed, counts } = useMemo(() => summarise(entries), [entries])

  const col = (title: string, rows: Entry[], bad: boolean, none: string) => (
    <div className="min-w-0">
      <h3 className={`text-[11px] font-medium uppercase tracking-[0.12em] ${bad && rows.length ? 'text-destructive' : 'text-muted-foreground'}`}>{title} · {rows.length}</h3>
      {rows.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{none}</p> : (
        <ul className="mt-2 divide-y divide-border border-y border-border">
          {rows.slice(0, 8).map((e) => (
            <li key={e.id} className="py-2.5">
              <Link to={`?entry=${e.id}`} replace className="break-words text-sm font-medium text-foreground hover:text-primary hover:underline">{e.title}</Link>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{e.type} · {e.author} · {ago(e.happened_at)}</p>
            </li>
          ))}
          {rows.length > 8 ? <li className="py-2 text-xs text-muted-foreground">and {rows.length - 8} more in the timeline below</li> : null}
        </ul>
      )}
    </div>
  )

  return (
    <Part
      id="summary" title="What works and what did not"
      hint={entries.length ? `From ${entries.length} Phase 2 ${entries.length === 1 ? 'entry' : 'entries'}: ${Object.entries(counts).map(([t, n]) => `${n} ${t.toLowerCase()}${n === 1 ? '' : 's'}`).join(', ')}.` : undefined}
    >
      {entries.length === 0 ? <Empty>Nothing has been logged in Phase 2 for this database yet.</Empty> : (
        <div className="grid gap-8 md:grid-cols-2">
          {col('What works', worked, false, 'Nothing fixed or resolved yet.')}
          {col('What did not', failed, true, 'No open errors.')}
        </div>
      )}
    </Part>
  )
}
