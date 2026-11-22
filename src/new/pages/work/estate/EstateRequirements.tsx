import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Plus, Search, X } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import { unwrap } from '../../../../lib/data'
import { btn, btnGhost, field, label } from '../../calendar/cal'
import { Select } from '@/components/ui/select'
import { Note } from '@/components/ui/note'
import { cn } from '@/lib/utils'
import { Empty, FormDialog, RefusalHint } from '../FormDialog'
import { saveError, type Db } from '../shared'
import {
  activeReqFilters, filterRequirements, groupByArea, KIND_LABEL, NO_DB, NO_REQ_FILTERS, PRIORITIES, PRIORITY_LABEL, REQ_KINDS, REQ_STATUSES, STATUS_LABEL, TOPICS,
  type Priority, type ReqKind, type ReqStatus, type Requirement, type Topic,
} from './EstateShared'

type DbName = Pick<Db, 'id' | 'name'>
const COLS = 'md:grid-cols-[minmax(0,2.6fr)_6.5rem_4.5rem_8rem_minmax(0,1.4fr)_4.5rem]'
const PRIORITY_TONE: Record<Priority, string> = { must: 'border-primary/50 bg-primary/10 text-foreground', should: 'border-border bg-secondary text-foreground', could: 'border-border text-muted-foreground' }
const KIND_TONE: Record<ReqKind, string> = { requirement: 'border-border bg-secondary text-foreground', risk: 'border-destructive/50 text-destructive', question: 'border-primary/50 bg-primary/10 text-foreground' }
const STATUS_TONE: Record<ReqStatus, string> = {
  proposed: 'border-border bg-secondary text-foreground',
  agreed: 'border-primary/50 bg-primary/10 text-foreground',
  done: 'border-border text-muted-foreground',
  dropped: 'border-border text-muted-foreground line-through',
}
const chip = 'inline-flex items-center gap-1 rounded-full border px-2 text-[11px] font-medium leading-5'
/** A question that has not been closed yet: easy to spot in the list. */
const isOpenQuestion = (r: Pick<Requirement, 'kind' | 'status'>) => r.kind === 'question' && r.status !== 'done' && r.status !== 'dropped'

export function EstateRequirements({ reqs, dbs, reload }: { reqs: Requirement[]; dbs: DbName[]; reload: () => void }) {
  const [f, setF] = useState(NO_REQ_FILTERS)
  const [editing, setEditing] = useState<Requirement | 'new' | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ id: string; text: string } | null>(null)
  const set = (k: keyof typeof NO_REQ_FILTERS) => (v: string) => setF((x) => ({ ...x, [k]: v }))
  const shown = useMemo(() => filterRequirements(reqs, f), [reqs, f])
  const groups = useMemo(() => groupByArea(shown), [shown])
  const filtering = activeReqFilters(f) > 0
  const openQuestions = reqs.filter(isOpenQuestion).length
  const dbName = (id: string | null) => dbs.find((d) => d.id === id)?.name ?? null

  async function setStatus(r: Requirement, status: ReqStatus) {
    if (busy || status === r.status) return
    setBusy(r.id); setMsg(null)
    try { unwrap(await supabase.from('gw_requirements').update({ status }).eq('id', r.id)); reload() }
    catch (e) { setMsg({ id: r.id, text: saveError(e, false) }) }
    finally { setBusy(null) }
  }

  const any = (text: string): { value: string; label: string } => ({ value: '', label: text })

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 max-w-sm flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input type="search" className={cn(field, 'h-9 pl-9 pr-8')} placeholder="Search requirements" aria-label="Search the requirements" value={f.q} onChange={(e) => set('q')(e.target.value)} />
          {f.q ? <button type="button" aria-label="Clear the search" onClick={() => set('q')('')} className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="size-3.5" aria-hidden="true" /></button> : null}
        </div>
        <button type="button" className={cn(btn, 'ml-auto')} onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden="true" /> Add requirement</button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Quick filter">
        <button type="button" aria-pressed={f.kind === ''} onClick={() => set('kind')('')} className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors', f.kind === '' ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}>All kinds</button>
        {REQ_KINDS.map((k) => (
          <button key={k} type="button" aria-pressed={f.kind === k} onClick={() => set('kind')(f.kind === k ? '' : k)}
            className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors', f.kind === k ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}>
            {KIND_LABEL[k]}s · {reqs.filter((r) => r.kind === k).length}
          </button>
        ))}
        <span className="ml-2 text-xs text-muted-foreground">Open questions are highlighted: {openQuestions} {openQuestions === 1 ? 'is' : 'are'} still open.</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="w-48"><Select aria-label="Area" value={f.area} onChange={set('area')} options={[any('All areas'), ...TOPICS.map((t) => ({ value: t.value as string, label: t.label }))]} /></div>
        <div className="w-36"><Select aria-label="Priority" value={f.priority} onChange={set('priority')} options={[any('All priorities'), ...PRIORITIES.map((p) => ({ value: p as string, label: PRIORITY_LABEL[p] }))]} /></div>
        <div className="w-36"><Select aria-label="Status" value={f.status} onChange={set('status')} options={[any('All statuses'), ...REQ_STATUSES.map((s) => ({ value: s as string, label: STATUS_LABEL[s] }))]} /></div>
        <div className="w-52"><Select aria-label="Database" value={f.database} onChange={set('database')} options={[any('All databases'), { value: NO_DB, label: 'No database' }, ...dbs.map((d) => ({ value: d.id, label: d.name }))]} /></div>
        {filtering ? <button type="button" onClick={() => setF(NO_REQ_FILTERS)} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Clear filters</button> : null}
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{filtering ? `${shown.length} of ${reqs.length}` : reqs.length} {reqs.length === 1 && !filtering ? 'item' : 'items'}</span>
      </div>

      <div className="mt-8">
        {reqs.length === 0 ? (
          <Empty>No requirements, risks or questions yet. <button type="button" className="text-primary hover:underline" onClick={() => setEditing('new')}>Add one</button></Empty>
        ) : shown.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">Nothing matches these filters. <button type="button" className="text-primary hover:underline" onClick={() => setF(NO_REQ_FILTERS)}>Clear them</button></p>
        ) : (
          <div className="space-y-10">
            {groups.map((g) => (
              <section key={g.area} aria-label={g.label}>
                <h2 className="flex items-baseline gap-3 border-b border-border pb-2 text-sm font-semibold tracking-tight">
                  {g.label}<span className="text-xs font-normal tabular-nums text-muted-foreground">{g.rows.length} {g.rows.length === 1 ? 'item' : 'items'}</span>
                </h2>
                <div className={cn('hidden gap-4 px-2 pb-2 pt-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground md:grid', COLS)} aria-hidden="true">
                  <span>Requirement</span><span>Kind</span><span>Priority</span><span>Status</span><span>Database</span><span />
                </div>
                <ul className="divide-y divide-border/60 border-y border-border/60">
                  {g.rows.map((r) => {
                    const name = dbName(r.database_id)
                    return (
                      <li key={r.id} className={cn('grid items-start gap-x-4 gap-y-2 px-2 py-3', COLS, r.status === 'dropped' && 'opacity-60', isOpenQuestion(r) && 'bg-primary/[0.06]')}>
                        <div className="min-w-0">
                          <p className={cn('break-words text-sm font-medium leading-snug', r.status === 'dropped' && 'line-through')}>{r.title}</p>
                          {r.detail ? <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">{r.detail}</p> : null}
                          {r.source_note ? <p className="mt-1.5 break-words text-[11px] leading-4 text-muted-foreground"><span className="font-medium text-foreground/80">Source:</span> {r.source_note}</p> : null}
                          {msg?.id === r.id ? <Note>{msg.text}</Note> : null}
                        </div>
                        <span><span className={cn(chip, KIND_TONE[r.kind])}>{r.kind === 'question' ? <span aria-hidden="true" className="grid size-3.5 place-items-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">?</span> : null}{KIND_LABEL[r.kind]}</span></span>
                        <span><span className={cn(chip, PRIORITY_TONE[r.priority])}>{PRIORITY_LABEL[r.priority]}</span></span>
                        <div className="w-32 md:w-auto"><Select aria-label={`Status of ${r.title}`} value={r.status} className={cn('!h-7 !rounded-full !px-2.5 !text-xs', STATUS_TONE[r.status])} disabled={busy === r.id} onChange={(v) => setStatus(r, v as ReqStatus)} options={REQ_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} /></div>
                        <span className="min-w-0 truncate text-sm">
                          {r.database_id ? (name ? <Link to={`/new/work/plan/${r.database_id}`} className="text-primary hover:underline" title={`Open the plan for ${name}`}>{name}</Link> : <span className="text-muted-foreground">Unknown database</span>) : <span className="text-muted-foreground">None</span>}
                        </span>
                        <span className="md:text-right"><button type="button" className={cn(btnGhost, '!h-8 !px-2.5')} aria-label={`Edit ${r.title}`} onClick={() => setEditing(r)}><Pencil className="size-3.5" aria-hidden="true" /> Edit</button></span>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {editing ? <ReqForm req={editing === 'new' ? null : editing} dbs={dbs} startArea={(f.area as Topic) || 'requirements'} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload() }} /> : null}
    </div>
  )
}

function ReqForm({ req, dbs, startArea, onClose, onDone }: { req: Requirement | null; dbs: DbName[]; startArea: Topic; onClose: () => void; onDone: () => void }) {
  const [area, setArea] = useState<Topic>(req?.area ?? startArea)
  const [kind, setKind] = useState<ReqKind>(req?.kind ?? 'requirement')
  const [priority, setPriority] = useState<Priority>(req?.priority ?? 'should')
  const [status, setStatus] = useState<ReqStatus>(req?.status ?? 'proposed')
  const [title, setTitle] = useState(req?.title ?? '')
  const [detail, setDetail] = useState(req?.detail ?? '')
  const [note, setNote] = useState(req?.source_note ?? '')
  const [dbId, setDbId] = useState(req?.database_id ?? '')
  return (
    <FormDialog
      title={req ? 'Edit requirement' : 'New requirement'} size="lg" saveLabel={req ? 'Save changes' : 'Add requirement'}
      check={{ title, detail, source_note: note }} onClose={onClose}
      onSave={async () => {
        if (!title.trim()) throw new Error('Give it a one-line title.')
        const row = { area, kind, priority, status, title: title.trim(), detail: detail.trim(), source_note: note.trim(), database_id: dbId || null }
        if (req) unwrap(await supabase.from('gw_requirements').update(row).eq('id', req.id))
        else unwrap(await supabase.from('gw_requirements').insert(row))
        onDone()
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div><label className={label} htmlFor="rq-area">Area</label><Select id="rq-area" value={area} onChange={(v) => setArea(v as Topic)} options={TOPICS.map((t) => ({ value: t.value, label: t.label }))} /></div>
        <div><label className={label} htmlFor="rq-kind">Kind</label><Select id="rq-kind" value={kind} onChange={(v) => setKind(v as ReqKind)} options={REQ_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} /></div>
        <div><label className={label} htmlFor="rq-pri">Priority</label><Select id="rq-pri" value={priority} onChange={(v) => setPriority(v as Priority)} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} /></div>
        <div><label className={label} htmlFor="rq-st">Status</label><Select id="rq-st" value={status} onChange={(v) => setStatus(v as ReqStatus)} options={REQ_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} /></div>
      </div>
      <div><label className={label} htmlFor="rq-title">Title</label><input id="rq-title" data-autofocus className={field} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></div>
      <div><label className={label} htmlFor="rq-detail">Detail</label><textarea id="rq-detail" className={cn(field, 'min-h-28 resize-y')} value={detail} maxLength={10000} onChange={(e) => setDetail(e.target.value)} /></div>
      <div><label className={label} htmlFor="rq-src">Where this came from</label><input id="rq-src" className={field} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="e.g. the kickoff call, a section of the Act" /></div>
      <div>
        <label className={label} htmlFor="rq-db">Database (optional)</label>
        <Select id="rq-db" value={dbId} onChange={setDbId} options={[{ value: '', label: 'No database' }, ...dbs.map((d) => ({ value: d.id, label: d.name }))]} />
        <p className="mt-1.5 text-xs text-muted-foreground">If set, the requirement links to that database's Plan page.</p>
      </div>
      <RefusalHint />
    </FormDialog>
  )
}
