import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import { unwrap } from '../../../../lib/data'
import { btn, btnGhost, dateTimeLabel, field, label } from '../../calendar/cal'
import { Select } from '@/components/ui/select'
import { Note } from '@/components/ui/note'
import { cn } from '@/lib/utils'
import { Empty, FormDialog, Part } from '../FormDialog'
import { saveError, STAGE_LABEL, STAGE_STATUS, type Stage, type StageStatus } from '../shared'

const DOT: Record<StageStatus, string> = { planned: 'bg-muted-foreground/60', in_progress: 'bg-primary', done: 'bg-primary/50', blocked: 'bg-destructive', dropped: 'bg-border' }

export function PlanStages({ dbId, stages, reload }: { dbId: string; stages: Stage[]; reload: () => void }) {
  const [editing, setEditing] = useState<Stage | 'new' | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ id: string; text: string } | null>(null)
  const list = [...stages].sort((a, b) => a.position - b.position)

  async function setStatus(s: Stage, status: StageStatus) {
    if (busy || status === s.status) return
    setBusy(s.id); setMsg(null)
    try { unwrap(await supabase.from('gw_plan_stages').update({ status }).eq('id', s.id)); reload() }
    catch (e) { setMsg({ id: s.id, text: saveError(e) }) }
    finally { setBusy(null) }
  }

  return (
    <Part
      id="stages" title="Build stages" count={list.length} hint="The steps to build this gateway, in order. The database records when a stage is marked done."
      action={<button type="button" className={btn} onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden="true" /> Add stage</button>}
    >
      {list.length === 0 ? <Empty>No stages planned yet.</Empty> : (
        <ol className="divide-y divide-border border-y border-border">
          {list.map((s, i) => (
            <li key={s.id} className={cn('grid gap-x-4 gap-y-2 px-1 py-4 md:grid-cols-[2rem_minmax(0,1fr)_11rem]', s.status === 'dropped' && 'opacity-60')}>
              <span className="text-sm tabular-nums text-muted-foreground">{i + 1}.</span>
              <div className="min-w-0">
                <h3 className="flex flex-wrap items-center gap-2 break-words text-sm font-semibold">
                  <span aria-hidden="true" className={cn('size-2 rounded-full', DOT[s.status])} />
                  <span className={cn(s.status === 'dropped' && 'line-through')}>{s.title}</span>
                </h3>
                {s.goal ? <p className="mt-1.5 max-w-[72ch] whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90"><b className="font-medium text-muted-foreground">Goal. </b>{s.goal}</p> : null}
                {s.done_when ? <p className="mt-1 max-w-[72ch] whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90"><b className="font-medium text-muted-foreground">Done when. </b>{s.done_when}</p> : null}
                {s.notes ? <p className="mt-1 max-w-[72ch] whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground"><b className="font-medium">Notes. </b>{s.notes}</p> : null}
                {s.completed_at ? <p className="mt-1.5 text-[11px] text-muted-foreground">Completed {dateTimeLabel(s.completed_at)}</p> : null}
                {msg?.id === s.id ? <Note>{msg.text}</Note> : null}
              </div>
              <div className="flex items-start gap-2 md:justify-end">
                <div className="w-36"><Select aria-label={`Status of ${s.title}`} value={s.status} disabled={busy === s.id} onChange={(v) => setStatus(s, v as StageStatus)} options={STAGE_STATUS.map((x) => ({ value: x, label: STAGE_LABEL[x] }))} /></div>
                <button type="button" className={cn(btnGhost, '!h-9 !px-2.5')} aria-label={`Edit ${s.title}`} onClick={() => setEditing(s)}><Pencil className="size-3.5" aria-hidden="true" /></button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {editing ? <StageForm dbId={dbId} stage={editing === 'new' ? null : editing} next={Math.max(0, ...list.map((s) => s.position)) + 1} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload() }} /> : null}
    </Part>
  )
}

function StageForm({ dbId, stage, next, onClose, onDone }: { dbId: string; stage: Stage | null; next: number; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState(stage?.title ?? '')
  const [goal, setGoal] = useState(stage?.goal ?? '')
  const [doneWhen, setDoneWhen] = useState(stage?.done_when ?? '')
  const [status, setStatus] = useState<StageStatus>(stage?.status ?? 'planned')
  const [notes, setNotes] = useState(stage?.notes ?? '')
  return (
    <FormDialog
      title={stage ? 'Edit stage' : 'New stage'} saveLabel={stage ? 'Save changes' : 'Add stage'}
      check={{ title, goal, doneWhen, notes }} onClose={onClose}
      onSave={async () => {
        if (!title.trim()) throw new Error('Give the stage a title.')
        const row = { title: title.trim(), goal: goal.trim(), done_when: doneWhen.trim(), notes: notes.trim() }
        if (stage) unwrap(await supabase.from('gw_plan_stages').update({ ...row, ...(status !== stage.status ? { status } : {}) }).eq('id', stage.id))
        else unwrap(await supabase.from('gw_plan_stages').insert({ ...row, status, database_id: dbId, position: next }))
        onDone()
      }}
    >
      <div><label className={label} htmlFor="st-title">Title</label><input id="st-title" data-autofocus className={field} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></div>
      <div><label className={label} htmlFor="st-goal">Goal</label><textarea id="st-goal" className={cn(field, 'min-h-20 resize-y')} value={goal} maxLength={5000} onChange={(e) => setGoal(e.target.value)} /></div>
      <div><label className={label} htmlFor="st-done">Done when</label><textarea id="st-done" className={cn(field, 'min-h-20 resize-y')} value={doneWhen} maxLength={5000} onChange={(e) => setDoneWhen(e.target.value)} /></div>
      <div><label className={label} htmlFor="st-status">Status</label><Select id="st-status" value={status} onChange={(v) => setStatus(v as StageStatus)} options={STAGE_STATUS.map((x) => ({ value: x, label: STAGE_LABEL[x] }))} /></div>
      <div><label className={label} htmlFor="st-notes">Notes</label><textarea id="st-notes" className={cn(field, 'min-h-24 resize-y')} value={notes} maxLength={10000} onChange={(e) => setNotes(e.target.value)} /></div>
    </FormDialog>
  )
}
