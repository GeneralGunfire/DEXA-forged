import { useMemo, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import { unwrap } from '../../../../lib/data'
import { btn, btnGhost, dateTimeLabel, field, label } from '../../calendar/cal'
import { Select } from '@/components/ui/select'
import { Note } from '@/components/ui/note'
import { cn } from '@/lib/utils'
import { Empty, FormDialog, Part } from '../FormDialog'
import { DECISION_KINDS, saveError, type Decision, type DecisionKind, type Stage } from '../shared'

const KIND_ORDER: Record<DecisionKind, number> = { blocker: 0, question: 1, decision: 2 }
const KIND_TONE: Record<DecisionKind, string> = { blocker: 'border-destructive/50 text-destructive', question: 'border-primary/50 bg-primary/10 text-foreground', decision: 'border-border bg-secondary text-foreground' }

export function PlanDecisions({ dbId, rows, stages, reload }: { dbId: string; rows: Decision[]; stages: Stage[]; reload: () => void }) {
  const [editing, setEditing] = useState<Decision | 'new' | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ id: string; text: string } | null>(null)
  // open items first (blockers, then questions, then decisions), then the resolved ones, newest first
  const list = useMemo(() => [...rows].sort((a, b) =>
    (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.created_at.localeCompare(a.created_at)), [rows])
  const open = rows.filter((r) => r.status === 'open').length
  const stageName = (id: string | null) => stages.find((s) => s.id === id)?.title

  async function flip(d: Decision) {
    if (busy) return
    setBusy(d.id); setMsg(null)
    try { unwrap(await supabase.from('gw_decisions').update({ status: d.status === 'open' ? 'resolved' : 'open' }).eq('id', d.id)); reload() }
    catch (e) { setMsg({ id: d.id, text: saveError(e) }) }
    finally { setBusy(null) }
  }

  return (
    <Part
      id="decisions" title="Decisions and blockers" count={rows.length} hint={`${open} open. Open items come first.`}
      action={<button type="button" className={btn} onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden="true" /> Add item</button>}
    >
      {list.length === 0 ? <Empty>Nothing recorded yet. Add a decision, a question or a blocker.</Empty> : (
        <ul className="divide-y divide-border border-y border-border">
          {list.map((d) => (
            <li key={d.id} className={cn('px-1 py-4', d.status === 'resolved' && 'opacity-70')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    <span className={cn('rounded-full border px-2 text-[11px] font-medium capitalize leading-5', KIND_TONE[d.kind])}>{d.kind}</span>
                    <span className="break-words">{d.title}</span>
                    {d.status === 'resolved' ? <span className="rounded-full border border-border px-2 text-[11px] font-normal leading-5 text-muted-foreground">Resolved</span> : null}
                  </p>
                  {d.body ? <p className="mt-1.5 max-w-[72ch] whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">{d.body}</p> : null}
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {stageName(d.stage_id) ? `Stage: ${stageName(d.stage_id)} · ` : ''}{d.resolved_at ? `Resolved ${dateTimeLabel(d.resolved_at)}` : `Raised ${dateTimeLabel(d.created_at)}`}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button type="button" className={cn(btn, '!h-8')} disabled={busy === d.id} onClick={() => flip(d)}>{d.status === 'open' ? 'Mark resolved' : 'Reopen'}</button>
                  <button type="button" className={cn(btnGhost, '!h-8 !px-2.5')} aria-label={`Edit ${d.title}`} onClick={() => setEditing(d)}><Pencil className="size-3.5" aria-hidden="true" /></button>
                </div>
              </div>
              {msg?.id === d.id ? <Note>{msg.text}</Note> : null}
            </li>
          ))}
        </ul>
      )}
      {editing ? <DecisionForm dbId={dbId} row={editing === 'new' ? null : editing} stages={stages} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload() }} /> : null}
    </Part>
  )
}

function DecisionForm({ dbId, row, stages, onClose, onDone }: { dbId: string; row: Decision | null; stages: Stage[]; onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<DecisionKind>(row?.kind ?? 'decision')
  const [title, setTitle] = useState(row?.title ?? '')
  const [body, setBody] = useState(row?.body ?? '')
  const [stageId, setStageId] = useState(row?.stage_id ?? '')
  return (
    <FormDialog
      title={row ? 'Edit item' : 'New item'} saveLabel={row ? 'Save changes' : 'Add item'}
      check={{ title, body }} onClose={onClose}
      onSave={async () => {
        if (!title.trim()) throw new Error('Give it a one-line title.')
        const v = { kind, title: title.trim(), body: body.trim(), stage_id: stageId || null }
        if (row) unwrap(await supabase.from('gw_decisions').update(v).eq('id', row.id))
        else unwrap(await supabase.from('gw_decisions').insert({ ...v, database_id: dbId, status: 'open' }))
        onDone()
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div><label className={label} htmlFor="dc-kind">Kind</label><Select id="dc-kind" value={kind} onChange={(v) => setKind(v as DecisionKind)} options={DECISION_KINDS.map((k) => ({ value: k, label: k.charAt(0).toUpperCase() + k.slice(1) }))} /></div>
        <div><label className={label} htmlFor="dc-stage">Stage (optional)</label><Select id="dc-stage" value={stageId} onChange={setStageId} options={[{ value: '', label: 'Not linked' }, ...[...stages].sort((a, b) => a.position - b.position).map((s) => ({ value: s.id, label: s.title }))]} /></div>
      </div>
      <div><label className={label} htmlFor="dc-title">Title</label><input id="dc-title" data-autofocus className={field} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></div>
      <div><label className={label} htmlFor="dc-body">Detail</label><textarea id="dc-body" className={cn(field, 'min-h-28 resize-y')} value={body} maxLength={10000} onChange={(e) => setBody(e.target.value)} /></div>
    </FormDialog>
  )
}
