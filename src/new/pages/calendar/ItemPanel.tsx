import { useState } from 'react'
import { Check, Copy, Pencil, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { unwrap, useLoad } from '../../../lib/data'
import {
  btn, btnGhost, btnPrimary, dateTimeLabel, dayKey, field, isOverdue, label, longDay, plainError, STATUS_LABEL,
  timeLabel, tone, type Ev, type Item, type Person, type Prompt, type Resp,
} from './cal'

const when = (e: Ev) => {
  if (e.all_day) return `${longDay(dayKey(e.starts_at))} (all day)`
  if (!e.ends_at) return dateTimeLabel(e.starts_at)
  return dayKey(e.ends_at) === dayKey(e.starts_at)
    ? `${dateTimeLabel(e.starts_at)} to ${timeLabel(e.ends_at)}`
    : `${dateTimeLabel(e.starts_at)} to ${dateTimeLabel(e.ends_at)}`
}

const Meta = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[7rem_1fr] gap-3 py-2.5 text-sm">
    <dt className="text-muted-foreground">{k}</dt>
    <dd className="min-w-0 text-foreground">{children}</dd>
  </div>
)

/** Slide-in panel for one calendar item. Every piece of text from prompts and responses is shown as plain text. */
export function ItemPanel({ ev, prompt, items, people, dbName, me, onClose, onChanged, onEdit }: {
  ev: Ev; prompt?: Prompt; items: Item[]; people: Person[]; dbName?: string; me: string
  onClose: () => void; onChanged: () => void; onEdit: () => void
}) {
  const now = new Date()
  const overdue = isOverdue(ev, now)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [responding, setResponding] = useState(false)
  const [text, setText] = useState('')
  const [confirming, setConfirming] = useState(false)

  const responses = useLoad<Resp[]>(async () => {
    if (!prompt) return []
    return unwrap<Resp[]>(await supabase.from('prompt_responses').select('id, prompt_id, body, responded_by, created_at').eq('prompt_id', prompt.id).order('created_at', { ascending: false })) ?? []
  }, [prompt?.id])

  const attendees = people.filter((p) => p.event_id === ev.id).map((p) => p.person)
  const list = items.filter((i) => i.event_id === ev.id).sort((a, b) => a.position - b.position)
  const cancelled = ev.status === 'cancelled'
  const reviewed = ev.status === 'reviewed'

  async function run(fn: () => PromiseLike<{ error: unknown }>, after?: () => void) {
    if (busy) return
    setBusy(true); setError(null)
    try {
      const { error: err } = await fn()
      if (err) throw err
      after?.()
      onChanged()
      responses.reload()
    } catch (err) {
      setError(plainError(err))
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(prompt?.prompt_text ?? ''); setCopied(true); setTimeout(() => setCopied(false), 1800) }
    catch { setError('Could not copy. Select the text and copy it by hand.') }
  }

  const tick = (i: Item) =>
    run(() => supabase.from('calendar_checklist_items').update(
      i.done_at ? { done_at: null, done_by: null, updated_at: new Date().toISOString() } : { done_at: new Date().toISOString(), done_by: me, updated_at: new Date().toISOString() },
    ).eq('id', i.id))

  const cancelItem = () =>
    run(() => supabase.from('calendar_events').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', ev.id), () => setConfirming(false))

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" role="dialog" aria-modal="true" aria-label={ev.title} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <aside className="flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-border bg-background p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{ev.kind === 'prompt' ? 'Prompt' : ev.category}</span>
              {prompt ? <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">{prompt.tag}</span> : null}
              <span className={`rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${tone(ev, now)}`}>{overdue ? 'Overdue' : STATUS_LABEL[ev.status]}</span>
            </div>
            <h2 className={`mt-2 text-2xl font-semibold tracking-tight ${cancelled ? 'line-through opacity-60' : ''}`}>{ev.title}</h2>
          </div>
          <button type="button" onClick={onClose} className={btnGhost + ' !px-2'} aria-label="Close"><X className="size-4" aria-hidden="true" /></button>
        </div>

        <dl className="mt-5 divide-y divide-border border-y border-border">
          <Meta k={ev.kind === 'prompt' ? 'Due' : 'When'}>{when(ev)}</Meta>
          <Meta k="Assignee">{ev.assignee ?? <span className="text-muted-foreground">Nobody</span>}</Meta>
          {ev.kind === 'event' ? <Meta k="Attendees">{attendees.length ? attendees.join(', ') : <span className="text-muted-foreground">None</span>}</Meta> : null}
          {dbName ? <Meta k="Database">{dbName}</Meta> : null}
          {prompt?.ran_at ? <Meta k="Ran">{prompt.ran_by ? `${prompt.ran_by}, ` : ''}{dateTimeLabel(prompt.ran_at)}</Meta> : null}
          {prompt?.done_at ? <Meta k="Done">{prompt.done_by ? `${prompt.done_by}, ` : ''}{dateTimeLabel(prompt.done_at)}</Meta> : null}
          {ev.cancelled_at ? <Meta k="Cancelled">{dateTimeLabel(ev.cancelled_at)}</Meta> : null}
        </dl>

        {ev.notes ? (
          <section className="mt-6">
            <h3 className={label}>Notes</h3>
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{ev.notes}</p>
          </section>
        ) : null}

        {list.length ? (
          <section className="mt-6">
            <h3 className={label}>Checklist · {list.filter((i) => i.done_at).length} of {list.length} done</h3>
            <ul className="divide-y divide-border">
              {list.map((i) => (
                <li key={i.id} className="py-2.5">
                  <label className="flex items-start gap-3 text-sm">
                    <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={!!i.done_at} disabled={busy || !me || cancelled} onChange={() => tick(i)} />
                    <span className="min-w-0 flex-1">
                      <span className={i.done_at ? 'text-muted-foreground line-through' : ''}>{i.text}</span>
                      {i.done_at ? <span className="mt-0.5 block text-xs text-muted-foreground">{i.done_by}, {dateTimeLabel(i.done_at)}</span> : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {prompt ? (
          <>
            <section className="mt-6">
              <div className="mb-1.5 flex items-center justify-between">
                <h3 className={label + ' !mb-0'}>Prompt</h3>
                <button type="button" onClick={copy} className={btn + ' !h-8'}>
                  {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <textarea readOnly value={prompt.prompt_text} aria-label="Prompt text" className={field + ' h-48 resize-y font-mono text-xs leading-5'} />
            </section>

            {prompt.paste_back ? (
              <section className="mt-6">
                <h3 className={label}>What to paste back</h3>
                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{prompt.paste_back}</p>
              </section>
            ) : null}

            {reviewed ? (
              <section className="mt-6 border-t border-border pt-6">
                <h3 className={label}>Reviewed{prompt.reviewed_at ? ` · ${dateTimeLabel(prompt.reviewed_at)}` : ''}</h3>
                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{prompt.review_note || <span className="text-muted-foreground">No review note.</span>}</p>
                <p className="mt-2 text-xs text-muted-foreground">Reviews are written by the Claude chat, so this is read-only.</p>
              </section>
            ) : null}

            <section className="mt-6 border-t border-border pt-6">
              <h3 className={label}>Responses{responses.data ? ` · ${responses.data.length}` : ''}</h3>
              {responses.loading ? <p className="text-sm text-muted-foreground">Loading…</p>
                : responses.error ? <p className="text-sm text-destructive">Could not load the responses: {responses.error}</p>
                : responses.data && responses.data.length ? (
                  <ol className="divide-y divide-border">
                    {responses.data.map((r) => (
                      <li key={r.id} className="py-3">
                        <p className="text-xs text-muted-foreground">{r.responded_by ?? 'Someone'} · {dateTimeLabel(r.created_at)}</p>
                        <p className="mt-1.5 max-h-60 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6">{r.body}</p>
                      </li>
                    ))}
                  </ol>
                ) : <p className="text-sm text-muted-foreground">No responses yet.</p>}
            </section>

            {!cancelled && !reviewed ? (
              <section className="mt-6">
                {responding ? (
                  <div>
                    <label className={label} htmlFor="resp">Your response</label>
                    <textarea id="resp" className={field + ' min-h-36 resize-y'} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Counts only. No patient data, passwords or keys. Text that looks like these is rejected.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button type="button" className={btnPrimary} disabled={busy || !text.trim()} onClick={() => run(() => supabase.rpc('prompt_respond', { p_tag: prompt.tag, p_body: text.trim() }), () => { setResponding(false); setText('') })}>
                        {busy ? 'Uploading…' : 'Upload and mark done'}
                      </button>
                      <button type="button" className={btn} onClick={() => { setResponding(false); setError(null) }}>Not now</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {ev.status === 'scheduled' ? (
                      <button type="button" className={btn} disabled={busy} onClick={() => run(() => supabase.rpc('prompt_mark_ran', { p_tag: prompt.tag }))}>I ran it</button>
                    ) : null}
                    <button type="button" className={btnPrimary} onClick={() => { setResponding(true); setError(null) }}>Respond</button>
                  </div>
                )}
              </section>
            ) : null}
          </>
        ) : null}

        {error ? <p className="mt-5 rounded-md border border-destructive/60 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p> : null}

        {!cancelled ? (
          <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-5" style={{ marginTop: '2rem' }}>
            {ev.kind === 'event' ? <button type="button" className={btn} onClick={onEdit}><Pencil className="size-4" aria-hidden="true" /> Edit</button> : null}
            {confirming ? (
              <>
                <span className="text-sm text-muted-foreground">Cancel this item? It stays in the calendar, marked cancelled.</span>
                <button type="button" className={btn + ' !border-destructive !text-destructive'} disabled={busy} onClick={cancelItem}>Yes, cancel it</button>
                <button type="button" className={btn} onClick={() => setConfirming(false)}>Keep it</button>
              </>
            ) : (
              <button type="button" className={btnGhost} onClick={() => setConfirming(true)}>Cancel this item</button>
            )}
          </div>
        ) : null}
      </aside>
    </div>
  )
}
