import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { describe, fmtDate, todayStr, unwrap, useLoad, useTeam } from '../../lib/data'
import { Dialog, EmptyState, Field, LoadState, PageHead } from '../../components/ui'
import { sectionByPath } from './sections'
import './pages.css'
import { useFeedback } from '../../components/feedback'

type Task = {
  id: string; title: string; notes: string; kind: 'task' | 'event'; assignee: string | null
  due_date: string | null; done: boolean; created_by: string; created_at: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

export default function Schedule() {
  const { confirm } = useFeedback()
  const s = sectionByPath('schedule')
  const { team, name: who } = useTeam()
  const { data, error, loading, reload } = useLoad<Task[]>(async () =>
    unwrap<Task[]>(await supabase.from('tasks').select('*').order('due_date', { ascending: true, nullsFirst: false })) ?? [])

  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [filter, setFilter] = useState<'open' | 'done' | 'all'>('open')
  const [editing, setEditing] = useState<{ task: Task | null; date?: string } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const now = new Date()
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() })

  const today = todayStr()
  const all = data ?? []

  async function toggle(t: Task) {
    try {
      unwrap(await supabase.from('tasks').update({ done: !t.done }).eq('id', t.id))
      reload()
    } catch (e) { setMsg(describe(e)) }
  }
  async function remove(t: Task) {
    if (!await confirm(`Delete "${t.title}"?`)) return
    try {
      unwrap(await supabase.from('tasks').delete().eq('id', t.id))
      reload()
    } catch (e) { setMsg(describe(e)) }
  }

  const groups: { title: string; items: Task[] }[] = []
  const open = all.filter((t) => !t.done)
  if (filter !== 'done') {
    groups.push({ title: 'Overdue', items: open.filter((t) => t.due_date && t.due_date < today) })
    groups.push({ title: 'Upcoming', items: open.filter((t) => t.due_date && t.due_date >= today) })
    groups.push({ title: 'No date', items: open.filter((t) => !t.due_date) })
  }
  if (filter !== 'open') groups.push({ title: 'Done', items: all.filter((t) => t.done) })
  const visible = groups.filter((g) => g.items.length)

  function row(t: Task) {
    const overdue = !t.done && t.due_date && t.due_date < today
    return (
      <div className={`item task${t.done ? ' task--done' : ''}`} key={t.id}>
        <input type="checkbox" checked={t.done} onChange={() => toggle(t)} aria-label={t.done ? 'Mark as not done' : 'Mark as done'} />
        <div className="item__main">
          <p className="item__title" title={t.title}>{t.title}</p>
          <p className="item__meta">
            {[t.kind === 'event' ? 'Event' : 'Task', t.assignee ? who(t.assignee) : 'Unassigned', t.due_date ? fmtDate(t.due_date) : 'No due date'].join(' · ')}
            {overdue && <> · <span style={{ color: '#b42318', fontWeight: 600 }}>Overdue</span></>}
          </p>
        </div>
        <div className="item__acts">
          <button type="button" className="btn btn--sm" onClick={() => setEditing({ task: t })}>Edit</button>
          <button type="button" className="btn btn--sm btn--danger" onClick={() => remove(t)}>Delete</button>
        </div>
      </div>
    )
  }

  /* ---- calendar ---- */
  const first = new Date(cursor.y, cursor.m, 1)
  const lead = (first.getDay() + 6) % 7 // Monday-first
  const cells = Array.from({ length: 42 }, (_, i) => new Date(cursor.y, cursor.m, 1 - lead + i))
  const monthLabel = first.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })
  const shift = (n: number) => { const d = new Date(cursor.y, cursor.m + n, 1); setCursor({ y: d.getFullYear(), m: d.getMonth() }) }

  return (
    <div className="pg">
      <PageHead title={s.label} blurb={s.blurb} action={<button type="button" className="btn btn--dark" onClick={() => setEditing({ task: null })}>New task or event</button>} />

      {msg && <p className="notice notice--err" role="alert">{msg}</p>}

      <div className="bar">
        <div className="seg" role="group" aria-label="View">
          <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
          <button type="button" aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}>Calendar</button>
        </div>
        {view === 'list' && (
          <div className="seg" role="group" aria-label="Show">
            {(['open', 'done', 'all'] as const).map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'open' ? 'Open' : f === 'done' ? 'Done' : 'All'}</button>
            ))}
          </div>
        )}
      </div>

      <LoadState loading={loading && !data} error={error}>
        {view === 'list' ? (
          visible.length === 0 ? (
            <EmptyState
              title={filter === 'done' ? 'Nothing completed yet.' : 'Nothing scheduled yet.'}
              text="Create a task or event, assign it to Rajen or Huzayfa and set a due date."
              action={<button type="button" className="btn btn--dark" onClick={() => setEditing({ task: null })}>New task or event</button>}
            />
          ) : (
            visible.map((g) => (
              <section key={g.title}>
                <h2 className="group-title">{g.title} ({g.items.length})</h2>
                <div className="rows">{g.items.map(row)}</div>
              </section>
            ))
          )
        ) : (
          <div className="cal">
            <div className="cal__head">
              <button type="button" className="btn btn--sm" onClick={() => shift(-1)} aria-label="Previous month">←</button>
              <h2>{monthLabel}</h2>
              <button type="button" className="btn btn--sm" onClick={() => shift(1)} aria-label="Next month">→</button>
            </div>
            <div className="cal__grid">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div className="cal__dow" key={d}>{d}</div>)}
              {cells.map((d) => {
                const key = ymd(d.getFullYear(), d.getMonth(), d.getDate())
                const items = all.filter((t) => t.due_date === key)
                const out = d.getMonth() !== cursor.m
                return (
                  <div
                    key={key}
                    className={`cal__day${out ? ' cal__day--out' : ''}${key === today ? ' cal__day--today' : ''}`}
                    onClick={() => setEditing({ task: null, date: key })}
                  >
                    <span className="cal__num">{d.getDate()}</span>
                    {items.slice(0, 3).map((t) => (
                      <button
                        key={t.id} type="button" title={t.title}
                        className={`cal__ev${t.kind === 'event' ? ' cal__ev--event' : ''}${t.done ? ' cal__ev--done' : ''}`}
                        onClick={(e) => { e.stopPropagation(); setEditing({ task: t }) }}
                      >{t.title}</button>
                    ))}
                    {items.length > 3 && <span className="muted" style={{ fontSize: 11 }}>+{items.length - 3} more</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {view === 'calendar' && all.some((t) => !t.due_date) && (
          <p className="muted" style={{ marginTop: 12 }}>
            {all.filter((t) => !t.due_date && !t.done).length} open item(s) have no due date and only show in the list view.
          </p>
        )}
      </LoadState>

      <TaskDialog value={editing} team={team} onClose={() => setEditing(null)} onDone={reload} />
    </div>
  )
}

function TaskDialog({
  value, team, onClose, onDone,
}: {
  value: { task: Task | null; date?: string } | null
  team: { user_id: string; display_name: string }[]
  onClose: () => void; onDone: () => void
}) {
  return (
    <Dialog open={!!value} onClose={onClose} title={value?.task ? 'Edit' : 'New task or event'}>
      {value && <TaskForm key={value.task?.id ?? `new-${value.date ?? ''}`} task={value.task} date={value.date} team={team} onClose={onClose} onDone={onDone} />}
    </Dialog>
  )
}

function TaskForm({
  task, date, team, onClose, onDone,
}: {
  task: Task | null; date?: string
  team: { user_id: string; display_name: string }[]
  onClose: () => void; onDone: () => void
}) {
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const title = String(fd.get('title') ?? '').trim()
    if (!title) return setErr('Give it a title.')
    const row = {
      title,
      notes: String(fd.get('notes') ?? ''),
      kind: String(fd.get('kind')) === 'event' ? 'event' : 'task',
      assignee: String(fd.get('assignee') ?? '') || null,
      due_date: String(fd.get('due') ?? '') || null,
    }
    setBusy(true)
    try {
      if (task) unwrap(await supabase.from('tasks').update(row).eq('id', task.id))
      else unwrap(await supabase.from('tasks').insert(row))
      onDone(); onClose()
    } catch (ex) { setErr(describe(ex)) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit}>
      <Field label="Title"><input type="text" name="title" autoFocus maxLength={200} defaultValue={task?.title ?? ''} /></Field>
      <div className="row2">
        <Field label="Type">
          <select name="kind" defaultValue={task?.kind ?? 'task'}>
            <option value="task">Task</option>
            <option value="event">Event</option>
          </select>
        </Field>
        <Field label="Assigned to">
          <select name="assignee" defaultValue={task?.assignee ?? ''}>
            <option value="">Unassigned</option>
            {team.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Due date"><input type="date" name="due" defaultValue={task?.due_date ?? date ?? ''} /></Field>
      <Field label="Notes"><textarea name="notes" rows={4} maxLength={5000} defaultValue={task?.notes ?? ''} /></Field>
      {err && <p className="formerr" role="alert">{err}</p>}
      <div className="dlg__foot">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn--dark" disabled={busy}>{busy ? 'Saving…' : task ? 'Save changes' : 'Create'}</button>
      </div>
    </form>
  )
}

