import { useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, Pencil } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { unwrap, useLoad } from '../../../lib/data'
import { btn } from '../calendar/cal'
import { DbForm } from './DbForm'
import { BackgroundTab, BuildTab, OverviewTab } from './RecordTabs'
import { DocumentsTab } from './DocumentsTab'
import { TimelineTab } from './TimelineTab'
import { TABS, type Db, type Tab } from './shared'
import { cn } from '@/lib/utils'
import { Loading } from '@/components/ui/loading'

export default function Record() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState(false)
  const { data, error, loading, reload } = useLoad<Db | null>(async () =>
    unwrap<Db | null>(await supabase.from('databases').select('*').eq('id', id).maybeSingle()), [id])
  const siblings = useLoad<{ id: string; name: string }[]>(async () =>
    unwrap<{ id: string; name: string }[]>(await supabase.from('databases').select('id, name').order('name')) ?? [])

  const asked = params.get('tab')
  const tab: Tab = (TABS as readonly string[]).includes(asked ?? '') ? (asked as Tab) : 'Overview' // an old "Development log" link lands on Overview
  const setTab = (t: Tab) => setParams((p) => { p.set('tab', t); p.delete('entry'); p.delete('doc'); return p }, { replace: true })

  const list = siblings.data ?? []
  const at = list.findIndex((x) => x.id === id)
  const prev = at > 0 ? list[at - 1] : null
  const next = at >= 0 && at < list.length - 1 ? list[at + 1] : null

  if (!loading && !error && data === null) return <Navigate to="/new/documentation/databases" replace />

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-20 pt-6 sm:px-8 sm:pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link to="/new/documentation/databases" className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" /> All databases</Link>
        {prev || next ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {prev ? <Link to={`/new/documentation/databases/${prev.id}${params.get('tab') ? `?tab=${params.get('tab')}` : ''}`} title={`Previous: ${prev.name}`} className="inline-flex max-w-[11rem] items-center gap-1 rounded-md px-2 py-1 hover:bg-secondary hover:text-foreground"><ChevronLeft className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{prev.name}</span></Link> : null}
            {next ? <Link to={`/new/documentation/databases/${next.id}${params.get('tab') ? `?tab=${params.get('tab')}` : ''}`} title={`Next: ${next.name}`} className="inline-flex max-w-[11rem] items-center gap-1 rounded-md px-2 py-1 hover:bg-secondary hover:text-foreground"><span className="truncate">{next.name}</span><ChevronRight className="size-3.5 shrink-0" aria-hidden="true" /></Link> : null}
          </span>
        ) : null}
      </div>

      {error ? <p className="mt-8 text-sm text-destructive" role="alert">Could not load this database: {error}</p>
        : loading && !data ? <Loading variant="detail" className="mt-8" />
        : data ? (
          <>
            <header className="mt-5 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="break-words text-3xl font-semibold tracking-tight sm:text-4xl">{data.name}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{[data.machine, data.db_type, data.status].filter(Boolean).join(' · ') || 'No machine, type or status set yet.'}</p>
              </div>
              <button type="button" className={btn} onClick={() => setEditing(true)}><Pencil className="size-4" aria-hidden="true" /> Edit details</button>
            </header>

            <div role="tablist" aria-label="Database sections" className="mt-8 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={cn('relative shrink-0 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring', tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
                >
                  {t}
                </button>
              ))}
            </div>

            <div role="tabpanel" aria-label={tab} className="mt-8">
              {tab === 'Overview' ? <OverviewTab db={data} />
                : tab === 'Background' ? <BackgroundTab db={data} reload={reload} />
                : tab === 'Build record' ? <BuildTab db={data} reload={reload} />
                : tab === 'Documents' ? <DocumentsTab db={data} />
                : <TimelineTab db={data} />}
            </div>

            {editing ? <DbForm db={data} onClose={() => setEditing(false)} onDone={() => { setEditing(false); reload(); siblings.reload() }} /> : null}
          </>
        ) : null}
    </div>
  )
}
