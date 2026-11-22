import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Plus } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import { unwrap } from '../../../../lib/data'
import { btn, btnGhost, field, label } from '../../calendar/cal'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Empty, FormDialog, Part } from '../FormDialog'
import type { Db, Dep } from '../shared'

/** Only active links are shown. The reason text can be edited; nothing here removes or switches off a link. */
export function PlanDependencies({ dbId, deps, dbs, reload }: { dbId: string; deps: Dep[]; dbs: Db[]; reload: () => void }) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Dep | null>(null)
  const name = (id: string) => dbs.find((d) => d.id === id)?.name ?? 'Unknown database'
  const before = deps.filter((d) => d.active && d.database_id === dbId)
  const after = deps.filter((d) => d.active && d.depends_on_database_id === dbId)
  const col = (title: string, rows: Dep[], pick: (d: Dep) => string, none: string) => (
    <div className="min-w-0">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{title} · {rows.length}</h3>
      {rows.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{none}</p> : (
        <ul className="mt-2 divide-y divide-border border-y border-border">
          {rows.map((d) => (
            <li key={d.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <Link to={`/new/work/plan/${pick(d)}`} className="text-sm font-medium text-primary hover:underline">{name(pick(d))}</Link>
                {d.reason ? <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">{d.reason}</p> : <p className="mt-0.5 text-xs text-muted-foreground">No reason given.</p>}
              </div>
              <button type="button" className={cn(btnGhost, '!h-8 shrink-0 !px-2.5')} aria-label={`Edit the reason for ${name(pick(d))}`} onClick={() => setEditing(d)}><Pencil className="size-3.5" aria-hidden="true" /> Edit reason</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
  return (
    <Part
      id="dependencies" title="Dependencies" count={before.length + after.length} hint="Which databases must be built first, and which ones wait for this one."
      action={<button type="button" className={btn} onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden="true" /> Add dependency</button>}
    >
      {before.length + after.length === 0 ? <Empty>No dependencies recorded. This database can be built on its own.</Empty> : (
        <div className="grid gap-8 md:grid-cols-2">
          {col('Build after', before, (d) => d.depends_on_database_id, 'Nothing has to come first.')}
          {col('Unblocks', after, (d) => d.database_id, 'No other database is waiting for this one.')}
        </div>
      )}
      {editing ? <ReasonForm dep={editing} first={name(editing.database_id)} second={name(editing.depends_on_database_id)} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload() }} /> : null}
      {adding ? <DepForm dbId={dbId} dbs={dbs} taken={before.map((d) => d.depends_on_database_id)} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload() }} /> : null}
    </Part>
  )
}

function DepForm({ dbId, dbs, taken, onClose, onDone }: { dbId: string; dbs: Db[]; taken: string[]; onClose: () => void; onDone: () => void }) {
  const [on, setOn] = useState('')
  const [reason, setReason] = useState('')
  return (
    <FormDialog
      title="New dependency" size="md" saveLabel="Add dependency" check={{ reason }} onClose={onClose}
      onSave={async () => {
        if (!on) throw new Error('Choose the database that must be built first.')
        unwrap(await supabase.from('gw_dependencies').insert({ database_id: dbId, depends_on_database_id: on, reason: reason.trim(), active: true }))
        onDone()
      }}
    >
      <div>
        <label className={label} htmlFor="dp-on">Build this one after</label>
        <Select id="dp-on" value={on} onChange={setOn} placeholder="Choose a database" options={dbs.filter((d) => d.id !== dbId && !taken.includes(d.id)).map((d) => ({ value: d.id, label: d.name }))} />
      </div>
      <div><label className={label} htmlFor="dp-why">Why</label><textarea id="dp-why" className={cn(field, 'min-h-20 resize-y')} value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} /></div>
    </FormDialog>
  )
}

/** Edit the reason text of an active dependency. Which databases it joins cannot be changed here. */
function ReasonForm({ dep, first, second, onClose, onDone }: { dep: Dep; first: string; second: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState(dep.reason)
  return (
    <FormDialog
      title="Edit reason" size="md" saveLabel="Save changes" check={{ reason }} onClose={onClose}
      onSave={async () => {
        unwrap(await supabase.from('gw_dependencies').update({ reason: reason.trim() }).eq('id', dep.id))
        onDone()
      }}
    >
      <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">{first}</span> is built after <span className="font-medium text-foreground">{second}</span>.</p>
      <div><label className={label} htmlFor="dp-reason">Why</label><textarea id="dp-reason" data-autofocus className={cn(field, 'min-h-24 resize-y')} value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} /></div>
    </FormDialog>
  )
}
