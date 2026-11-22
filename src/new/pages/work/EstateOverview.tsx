import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { SETUP, unwrap, useLoad } from '../../../lib/data'
import { btn } from '../calendar/cal'
import { EstateResearch } from './estate/EstateResearch'
import { EstateRequirements } from './estate/EstateRequirements'
import { requirementStats, sectionCounts, STATUS_LABEL, REQ_STATUSES, type EstateSection, type Requirement } from './estate/EstateShared'
import type { Db } from './shared'
import { cn } from '@/lib/utils'
import { Loading } from '@/components/ui/loading'

const TABS = ['Research', 'Requirements'] as const
type Tab = (typeof TABS)[number]
const LOAD_CAP = 1000
type Data = { sections: EstateSection[]; reqs: Requirement[]; dbs: Pick<Db, 'id' | 'name'>[] }

export default function EstateOverview() {
  const [params, setParams] = useSearchParams()
  const { data, error, loading, reload } = useLoad<Data>(async () => {
    const [s, r, d] = await Promise.all([
      supabase.from('gw_estate_sections').select('*').order('updated_at', { ascending: false }).limit(LOAD_CAP),
      supabase.from('gw_requirements').select('*').order('updated_at', { ascending: false }).limit(LOAD_CAP),
      supabase.from('databases').select('id, name').order('name'),
    ])
    return { sections: unwrap<EstateSection[]>(s) ?? [], reqs: unwrap<Requirement[]>(r) ?? [], dbs: unwrap<Pick<Db, 'id' | 'name'>[]>(d) ?? [] }
  })

  const asked = params.get('tab')
  const tab: Tab = (TABS as readonly string[]).includes(asked ?? '') ? (asked as Tab) : 'Research'
  const setTab = (t: Tab) => setParams((p) => { p.set('tab', t); return p }, { replace: true })

  const conf = useMemo(() => sectionCounts(data?.sections ?? []), [data])
  const rs = useMemo(() => requirementStats(data?.reqs ?? []), [data])

  const stat = (k: string, v: number, bad = false) => (
    <div key={k}>
      <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{k}</dt>
      <dd className={cn('mt-1 text-2xl font-semibold tabular-nums tracking-tight', bad && v > 0 && 'text-destructive')}>{v.toLocaleString('en-ZA')}</dd>
    </div>
  )

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-20 pt-8 sm:px-8 sm:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Work</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Estate</h1>
          <p className="mt-2 max-w-[72ch] text-sm text-muted-foreground">Research and requirements for Phase 2: what we know, how sure we are, and what the gateway has to do. This is separate from the Documentation estate overview.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/new/work/plan" className={btn}>Plan</Link>
          <button type="button" className={btn} onClick={reload} disabled={loading}><RefreshCw className={cn('size-4', loading && 'animate-spin')} aria-hidden="true" /> Refresh</button>
        </div>
      </header>

      {error === SETUP ? (
        <p className="mt-10 rounded-xl border border-dashed border-border px-6 py-14 text-center text-sm text-muted-foreground" role="status">
          This part is not set up yet. The tables behind the Estate page have not been created, so there is nothing to show. Ask the Claude chat to create them, then press Refresh.
        </p>
      ) : error ? (
        <p className="mt-10 text-sm text-destructive" role="alert">Could not load the Estate page: {error}</p>
      ) : loading && !data ? (
        <Loading variant="detail" className="mt-10" />
      ) : data ? (
        <>
          <div className="mt-8 grid gap-x-10 gap-y-6 border-t border-border pt-5 lg:grid-cols-[auto_auto_auto]">
            <section aria-label="Research by confidence">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Research sections</h2>
              <dl className="mt-3 grid grid-cols-3 gap-6">{stat('Confirmed', conf.confirmed)}{stat('Partly', conf.partly)}{stat('Not established', conf.not_established, true)}</dl>
            </section>
            <section aria-label="Requirements by status">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Requirements by status</h2>
              <dl className="mt-3 grid grid-cols-4 gap-6">{REQ_STATUSES.map((s) => stat(STATUS_LABEL[s], rs.byStatus[s]))}</dl>
            </section>
            <section aria-label="Needs attention">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Needs attention</h2>
              <dl className="mt-3 grid grid-cols-2 gap-6">{stat('Open questions', rs.openQuestions, true)}{stat('Must-haves outstanding', rs.mustOutstanding, true)}</dl>
            </section>
          </div>

          <div role="tablist" aria-label="Estate sections" className="mt-8 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border">
            {TABS.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={cn('relative shrink-0 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring', tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                {t}
              </button>
            ))}
          </div>

          <div role="tabpanel" aria-label={tab} className="mt-8">
            {tab === 'Research' ? <EstateResearch sections={data.sections} reload={reload} /> : <EstateRequirements reqs={data.reqs} dbs={data.dbs} reload={reload} />}
          </div>
        </>
      ) : null}
    </div>
  )
}
