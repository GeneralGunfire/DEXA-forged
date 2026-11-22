import { useState, type FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import {
  btn, btnGhost, btnPrimary, CATEGORIES, dayKey, field, fromInput, instant, label, PEOPLE, plainError, toInput, todayKey,
  type Db, type Ev, type Item, type Person,
} from './cal'

type Row = { id: string | null; text: string; original: string } // id null = not saved yet

/** Create or edit a normal calendar event. Prompt items are created by the Claude chat, not here. */
export function EventEditor({ event, day, startAt, people, items, dbs, onClose, onSaved }: {
  event: Ev | null; day: string; startAt?: string; people: Person[]; items: Item[]; dbs: Db[]
  onClose: () => void; onSaved: (id: string) => void
}) {
  const editing = !!event
  const [title, setTitle] = useState(event?.title ?? '')
  const [category, setCategory] = useState(event?.category && event.category !== 'prompt' ? event.category : 'work')
  const [allDay, setAllDay] = useState(event?.all_day ?? false)
  const [start, setStart] = useState(event && !event.all_day ? toInput(event.starts_at) : startAt ?? `${day}T09:00`)
  const [end, setEnd] = useState(event?.ends_at && !event.all_day ? toInput(event.ends_at) : startAt ? toInput(new Date(new Date(fromInput(startAt)).getTime() + 3600000).toISOString()) : '')
  const [dayOnly, setDayOnly] = useState(event?.all_day ? dayKey(event.starts_at) : day)
  const [assignee, setAssignee] = useState(event?.assignee ?? '')
  const [attendees, setAttendees] = useState<string[]>(people.filter((p) => p.event_id === event?.id).map((p) => p.person))
  const [notes, setNotes] = useState(event?.notes ?? '')
  const [dbId, setDbId] = useState(event?.database_id ?? '')
  const [rows, setRows] = useState<Row[]>(
    items.filter((i) => i.event_id === event?.id).sort((a, b) => a.position - b.position).map((i) => ({ id: i.id, text: i.text, original: i.text })),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)
    if (!title.trim()) return setError('Give the event a title.')
    const starts = allDay ? instant(dayOnly).toISOString() : start ? fromInput(start) : ''
    if (!starts) return setError('Choose a start time.')
    const ends = allDay || !end ? null : fromInput(end)
    if (ends && ends <= starts) return setError('The end must be after the start.')

    setBusy(true)
    try {
      const body = {
        title: title.trim(), category, notes, starts_at: starts, ends_at: ends, all_day: allDay,
        assignee: assignee || null, database_id: dbId || null, updated_at: new Date().toISOString(),
      }
      let id = event?.id ?? ''
      if (editing) {
        const { error: err } = await supabase.from('calendar_events').update(body).eq('id', id)
        if (err) throw err
      } else {
        const { data, error: err } = await supabase.from('calendar_events').insert({ ...body, kind: 'event' }).select('id').single()
        if (err) throw err
        id = (data as { id: string }).id
      }

      // attendees: add the new ones, remove the unticked ones
      const before = people.filter((p) => p.event_id === id).map((p) => p.person)
      const add = attendees.filter((p) => !before.includes(p))
      const drop = before.filter((p) => !attendees.includes(p))
      if (add.length) {
        const { error: err } = await supabase.from('calendar_event_people').insert(add.map((person) => ({ event_id: id, person })))
        if (err) throw err
      }
      for (const person of drop) {
        const { error: err } = await supabase.from('calendar_event_people').delete().eq('event_id', id).eq('person', person)
        if (err) throw err
      }

      // checklist: rename changed items, add new ones (items are never removed)
      for (const r of rows.filter((x) => x.id && x.text.trim() && x.text !== x.original)) {
        const { error: err } = await supabase.from('calendar_checklist_items').update({ text: r.text.trim(), updated_at: new Date().toISOString() }).eq('id', r.id!)
        if (err) throw err
      }
      const fresh = rows.filter((x) => !x.id && x.text.trim())
      if (fresh.length) {
        const first = rows.length - fresh.length
        const { error: err } = await supabase.from('calendar_checklist_items').insert(fresh.map((r, i) => ({ event_id: id, text: r.text.trim(), position: first + i })))
        if (err) throw err
      }
      onSaved(id)
    } catch (err) {
      setError(plainError(err))
      setBusy(false)
    }
  }

  const toggle = (p: string) => setAttendees((a) => (a.includes(p) ? a.filter((x) => x !== p) : [...a, p]))

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label={editing ? 'Edit event' : 'New event'}>
      <form onSubmit={save} className="w-full max-w-xl rounded-xl border border-border bg-background p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">{editing ? 'Edit event' : 'New event'}</h2>
          <button type="button" onClick={onClose} className={btnGhost + ' !px-2'} aria-label="Close"><X className="size-4" aria-hidden="true" /></button>
        </div>

        <div className="space-y-5">
          <div>
            <label className={label} htmlFor="ev-title">Title</label>
            <input id="ev-title" className={field} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="ev-cat">Category</label>
              <select id="ev-cat" className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="ev-who">Assignee</label>
              <select id="ev-who" className={field} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">Nobody</option>
                {PEOPLE.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="size-4 accent-primary" />
            All day
          </label>
          {allDay ? (
            <div>
              <label className={label} htmlFor="ev-day">Date</label>
              <input id="ev-day" type="date" className={field} value={dayOnly} onChange={(e) => setDayOnly(e.target.value || todayKey())} />
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="ev-start">Starts</label>
                <input id="ev-start" type="datetime-local" className={field} value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="ev-end">Ends (optional)</label>
                <input id="ev-end" type="datetime-local" className={field} value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
          )}
          <p className="-mt-3 text-xs text-muted-foreground">Times are Johannesburg time.</p>

          <fieldset>
            <legend className={label}>Attendees</legend>
            <div className="flex gap-6">
              {PEOPLE.map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={attendees.includes(p)} onChange={() => toggle(p)} className="size-4 accent-primary" />
                  {p}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label className={label} htmlFor="ev-db">Database (optional)</label>
            <select id="ev-db" className={field} value={dbId} onChange={(e) => setDbId(e.target.value)}>
              <option value="">None</option>
              {dbs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          <div>
            <label className={label} htmlFor="ev-notes">Notes</label>
            <textarea id="ev-notes" className={field + ' min-h-24 resize-y'} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <p className="mt-1.5 text-xs text-muted-foreground">Counts and descriptions only. No patient data, passwords or keys.</p>
          </div>

          <div>
            <span className={label}>Checklist</span>
            <ul className="space-y-2">
              {rows.map((r, i) => (
                <li key={r.id ?? `new-${i}`} className="flex items-center gap-2">
                  <input
                    className={field}
                    value={r.text}
                    maxLength={500}
                    aria-label={`Checklist item ${i + 1}`}
                    onChange={(e) => setRows((all) => all.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                  />
                  {!r.id ? (
                    <button type="button" className={btnGhost + ' !px-2'} aria-label="Remove this new item" onClick={() => setRows((all) => all.filter((_, j) => j !== i))}>
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            <button type="button" className={btnGhost + ' mt-2 !px-2'} onClick={() => setRows((all) => [...all, { id: null, text: '', original: '' }])}>
              <Plus className="size-4" aria-hidden="true" /> Add item
            </button>
            <p className="mt-1 text-xs text-muted-foreground">Items can be renamed and ticked, but not removed once saved.</p>
          </div>
        </div>

        {error ? <p className="mt-5 rounded-md border border-destructive/60 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className={btn} onClick={onClose}>Close</button>
          <button type="submit" className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create event'}</button>
        </div>
      </form>
    </div>
  )
}
