import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw, TriangleAlert } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { unwrap, useLoad } from '../../../lib/data'
import { btn } from '../calendar/cal'
import { PlanSections } from './plan/PlanSections'
import { PlanConnections } from './plan/PlanConnections'
import { PlanMappings } from './plan/PlanMappings'
import { PlanStages } from './plan/PlanStages'
import { PlanDecisions } from './plan/PlanDecisions'
import { PlanDependencies } from './plan/PlanDependencies'
import { bar, pct, progress, type ConnOption, type Db, type Decision, type Dep, type Mapping, type PlanSection, type Stage } from './shared'
import { cn } from '@/lib/utils'
import { Loading } from '@/components/ui/loading'

type Data = { dbs: Db[]; sections: PlanSection[]; options: ConnOption[]; maps: Mapping[]; stages: Stage[]; decisions: Decision[]; deps: Dep[] }

const PARTS = [['sections', 'Sections'], ['connection', 'Connection'], ['mapping', 'Field mapping'], ['stages', 'Stages'], ['decisions', 'Decisions'], ['dependencies', 'Dependencies']] as const

export default function PlanDb() {
  const { id = '' } = useParams()
  const { data, error, loading, reload } = useLoad<Data>(async () => {
    const own = (t: string) => supabase.from(t).select('*').eq('database_id', id).limit(5000)
    const [dbs, sections, options, maps, stages, decisions, deps] = await Promise.all([
      supabase.from('databases').select('id, name, machine, db_type, status').order('name'),
      own('gw_plan_sections'), own('gw_connection_options'), own('gw_field_mappings'), own('gw_plan_stages'), own('gw_decisions'),
      supabase.from('gw_dependencies').select('*').or(`database_id.eq.${id},depends_on_database_id.eq.${id}`).limit(5000),
    ])
    return {
      dbs: unwrap<Db[]>(dbs) ?? [], sections: unwrap<PlanSection[]>(sections) ?? [], options: unwrap<ConnOption[]>(options) ?? [], maps: unwrap<Mapping[]>(maps) ?? [],
      stages: unwrap<Stage[]>(stages) ?? [], decisions: unwrap<Decision[]>(decisions) ?? [], deps: unwrap<Dep[]>(deps) ?? [],
    }
  }, [id])

  const dbs = data?.dbs ?? []
  const db = dbs.find((d) => d.id === id)
  const at = dbs.findIndex((d) => d.id === id)
  const prev = at > 0 ? dbs[at - 1] : null
  const next = at >= 0 && at < dbs.length - 1 ? dbs[at + 1] : null
  const p = progress(data?.stages ?? [], data?.decisions ?? [])

  if (!loading && !error && data && !db) return <Navigate to="/new/work/plan" replace />

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-20 pt-6 sm:px-8 sm:pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link to="/new/work/plan" className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" /> All plans</Link>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {prev ? <Link to={`/new/work/plan/${prev.id}`} title={`Previous: ${prev.name}`} className="inline-flex max-w-[11rem] items-center gap-1 rounded-md px-2 py-1 hover:bg-secondary hover:text-foreground"><ChevronLeft className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{prev.name}</span></Link> : null}
          {next ? <Link to={`/new/work/plan/${next.id}`} title={`Next: ${next.name}`} className="inline-flex max-w-[11rem] items-center gap-1 rounded-md px-2 py-1 hover:bg-secondary hover:text-foreground"><span className="truncate">{next.name}</span><ChevronRight className="size-3.5 shrink-0" aria-hidden="true" /></Link> : null}
        </span>
      </div>

      {error ? <p className="mt-8 text-sm text-destructive" role="alert">Could not load this plan: {error}</p>
        : loading && !data ? <Loading variant="detail" className="mt-8" />
        : data && db ? (
          <>
            <header className="mt-5 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="break-words text-3xl font-semibold tracking-tight sm:text-4xl">{db.name}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{[db.machine, db.db_type, db.status].filter(Boolean).join(' · ') || 'No machine, type or status set yet.'}</p>
              </div>
              <button type="button" className={btn} onClick={reload} disabled={loading}><RefreshCw className={cn('size-4', loading && 'animate-spin')} aria-hidden="true" /> Refresh</button>
            </header>

            <div className="mt-6 max-w-xl">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{p.total === 0 ? 'No stages planned yet' : `${p.done} of ${p.total} stages done`}</span>
                {p.blocked ? <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive"><TriangleAlert className="size-3.5" aria-hidden="true" /> Blocked{p.blockers ? `, ${p.blockers} open ${p.blockers === 1 ? 'blocker' : 'blockers'}` : ''}</span> : null}
              </div>
              <div className={cn(bar, 'mt-2')} role="progressbar" aria-label="Stages done" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.done}>
                <span className="block h-full rounded-full bg-primary" style={{ width: `${pct(p.done, p.total)}%` }} />
              </div>
              {p.next ? <p className="mt-2 text-xs text-muted-foreground">Next: <span className="text-foreground">{p.next.title}</span></p> : null}
            </div>

            <nav aria-label="On this page" className="mt-8 flex gap-1 overflow-x-auto border-b border-border">
              {PARTS.map(([anchor, text]) => (
                <a key={anchor} href={`#${anchor}`} onClick={(e) => { e.preventDefault(); document.getElementById(anchor)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }) }}
                  className="shrink-0 border-b-2 border-transparent px-3.5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">{text}</a>
              ))}
            </nav>

            <div className="mt-8 space-y-12">
              <PlanSections dbId={id} sections={data.sections} reload={reload} />
              <PlanConnections dbId={id} options={data.options} reload={reload} />
              <PlanMappings dbId={id} rows={data.maps} reload={reload} />
              <PlanStages dbId={id} stages={data.stages} reload={reload} />
              <PlanDecisions dbId={id} rows={data.decisions} stages={data.stages} reload={reload} />
              <PlanDependencies dbId={id} deps={data.deps} dbs={dbs} reload={reload} />
            </div>
          </>
        ) : null}
    </div>
  )
}
