import { useState, type FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import {
  btn, btnGhost, btnPrimary, CATEGORIES, dayKey, field, fromInput, instant, label, PEOPLE, plainError, toInput, todayKey,
  type Db, type Ev, type Item, type Person,
} from './cal'
import { Dialog } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/ui/date-picker'
import { DateTimeField } from '@/components/ui/datetime-field'

type Row = { id: string | null; text: string; original: string } // id null = not saved yet

const CAT = CATEGORIES.map((c) => ({ value: c as string, label: c[0].toUpperCase() + c.slice(1) }))
const WHO = [{ value: '', label: 'Nobody' }, ...PEOPLE.map((p) => ({ value: p as string, label: p }))]

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
  const [end, setEnd] = useState(
    event?.ends_at && !event.all_day ? toInput(event.ends_at)
      : startAt ? toInput(new Date(new Date(fromInput(startAt)).getTime() + 3600000).toISOString()) : '',
  )
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
    if (!starts) return setError('Choose a start date and time.')
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

  const toggle = (p: string, on: boolean) => setAttendees((a) => (on ? (a.includes(p) ? a : [...a, p]) : a.filter((x) => x !== p)))

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? 'Edit event' : 'New event'}
      size="lg"
      notice={error}
      footer={
        <>
          <button type="button" className={btn} onClick={onClose}>Close</button>
          <button type="submit" form="ev-form" className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create event'}</button>
        </>
      }
    >
      <form id="ev-form" onSubmit={save} className="space-y-5">
        <div>
          <label className={label} htmlFor="ev-title">Title</label>
          <input id="ev-title" data-autofocus className={field} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="ev-cat">Category</label>
            <Select id="ev-cat" value={category} onChange={setCategory} options={CAT} />
          </div>
          <div>
            <label className={label} htmlFor="ev-who">Assignee</label>
            <Select id="ev-who" value={assignee} onChange={setAssignee} options={WHO} />
          </div>
        </div>

        <Checkbox checked={allDay} onChange={setAllDay}>All day</Checkbox>
        {allDay ? (
          <div>
            <label className={label} htmlFor="ev-day">Date</label>
            <DatePicker id="ev-day" value={dayOnly} onChange={(v) => setDayOnly(v || todayKey())} />
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="ev-start">Starts</label>
              <DateTimeField id="ev-start" label="Starts" value={start} onChange={setStart} />
            </div>
            <div>
              <label className={label} htmlFor="ev-end">Ends (optional)</label>
              <DateTimeField id="ev-end" label="Ends" value={end} onChange={setEnd} clearable defaultTime="10:00" />
            </div>
          </div>
        )}
        <p className="-mt-3 text-xs text-muted-foreground">Times are Johannesburg time, 24-hour.</p>

        <fieldset>
          <legend className={label}>Attendees</legend>
          <div className="flex gap-6">
            {PEOPLE.map((p) => <Checkbox key={p} checked={attendees.includes(p)} onChange={(on) => toggle(p, on)}>{p}</Checkbox>)}
          </div>
        </fieldset>

        <div>
          <label className={label} htmlFor="ev-db">Database (optional)</label>
          <Select id="ev-db" value={dbId} onChange={setDbId} options={[{ value: '', label: 'None' }, ...dbs.map((d) => ({ value: d.id, label: d.name }))]} />
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

      </form>
    </Dialog>
  )
}
