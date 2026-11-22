import { useRef, useState } from 'react'
import { Check, Copy, Pencil } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { unwrap, useLoad } from '../../../lib/data'
import {
  btn, btnGhost, btnPrimary, dateTimeLabel, dayKey, field, isOverdue, label, longDay, plainError, STATUS_LABEL,
  timeLabel, tone, type Ev, type Item, type Person, type Prompt, type Resp,
} from './cal'
import { Dialog, CloseButton } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Note } from '@/components/ui/note'
import { TagPill } from './Views'
import { cn } from '@/lib/utils'

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

/** Which button a message belongs to, so it can sit directly under that button. */
type Kind = 'ran' | 'respond' | 'tick' | 'cancel' | 'copy'
type Msg = { kind: Kind; ok: boolean; text: string }
const WAIT_MS = 20000

/**
 * Side panel for one calendar item. Every piece of text from prompts and responses is shown as plain text.
 *
 * Every action here reports what happened, right under its own button: it never fails silently. Each action has its
 * own "working" state (one stuck action cannot disable another), each call gives up with a clear message after
 * 20 seconds, and an upload is checked afterwards to make sure the response really exists.
 */
export function ItemPanel({ ev, prompt, items, people, dbName, me, onClose, onChanged, onEdit }: {
  ev: Ev; prompt?: Prompt; items: Item[]; people: Person[]; dbName?: string; me: string
  onClose: () => void; onChanged: () => void; onEdit: () => void
}) {
  const now = new Date()
  const overdue = isOverdue(ev, now)
  const [pending, setPending] = useState<Kind | null>(null)
  const [msg, setMsg] = useState<Msg | null>(null)
  const [responding, setResponding] = useState(false)
  const [text, setText] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [copied, setCopied] = useState(false)
  const lock = useRef<Kind | null>(null) // set the moment an action starts, so a double click cannot send it twice

  const responses = useLoad<Resp[]>(async () => {
    if (!prompt) return []
    return unwrap<Resp[]>(await supabase.from('prompt_responses').select('id, prompt_id, body, responded_by, created_at').eq('prompt_id', prompt.id).order('created_at', { ascending: false })) ?? []
  }, [prompt?.id])

  const attendees = people.filter((p) => p.event_id === ev.id).map((p) => p.person)
  const list = items.filter((i) => i.event_id === ev.id).sort((a, b) => a.position - b.position)
  const cancelled = ev.status === 'cancelled'
  const reviewed = ev.status === 'reviewed'

  /** Run one action. It reports success or failure under its own button, and never just does nothing. */
  async function run(
    kind: Kind,
    fn: () => PromiseLike<{ error: unknown }>,
    opts: { after?: () => void; ok?: string; verify?: () => Promise<string | null> } = {},
  ) {
    if (lock.current) { setMsg({ kind, ok: false, text: 'Still finishing the last action. Wait a moment, then try again.' }); return }
    lock.current = kind
    setPending(kind); setMsg(null)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const gaveUp = new Promise<never>((_, no) => { timer = setTimeout(() => no(new Error('The server did not answer within 20 seconds, so nothing was changed. Check your connection and try again.')), WAIT_MS) })
      const res = await Promise.race([Promise.resolve(fn()), gaveUp])
      if (res.error) throw res.error
      const problem = opts.verify ? await opts.verify() : null
      if (problem) throw new Error(problem)
      opts.after?.()
      if (opts.ok) setMsg({ kind, ok: true, text: opts.ok })
      onChanged()
      responses.reload()
    } catch (err) {
      console.error('[New Forge] item panel action failed:', kind, err)
      setMsg({ kind, ok: false, text: plainError(err) })
    } finally {
      clearTimeout(timer)
      lock.current = null
      setPending(null)
    }
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(prompt?.prompt_text ?? ''); setCopied(true); setMsg(null); setTimeout(() => setCopied(false), 1800) }
    catch { setMsg({ kind: 'copy', ok: false, text: 'Could not copy automatically. Select the text in the box and copy it by hand.' }) }
  }

  const tick = (i: Item) =>
    run('tick', () => supabase.from('calendar_checklist_items').update(
      i.done_at ? { done_at: null, done_by: null, updated_at: new Date().toISOString() } : { done_at: new Date().toISOString(), done_by: me, updated_at: new Date().toISOString() },
    ).eq('id', i.id))

  const respond = () => {
    if (!prompt) return
    const before = responses.data?.length ?? 0
    return run('respond', () => supabase.rpc('prompt_respond', { p_tag: prompt.tag, p_body: text.trim() }), {
      after: () => { setResponding(false); setText('') },
      ok: `Uploaded. ${prompt.tag} is now marked done.`,
      // the server said "ok": make sure a new response really exists before telling the person it worked
      verify: async () => {
        const { count, error } = await supabase.from('prompt_responses').select('id', { count: 'exact', head: true }).eq('prompt_id', prompt.id)
        if (error || count === null) return null
        return count > before ? null : 'The server accepted the upload but no new response was saved, so nothing was marked done. Press Refresh and look again, and tell the team if it happens twice.'
      },
    })
  }

  const cancelItem = () =>
    run('cancel', () => supabase.from('calendar_events').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', ev.id), { after: () => setConfirming(false) })

  const under = (k: Kind) => (msg && msg.kind === k ? <Note ok={msg.ok}>{msg.text}</Note> : null)

  const header = (
    <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-6 py-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{ev.kind === 'prompt' ? 'Prompt' : ev.category}</span>
          {prompt ? <TagPill tag={prompt.tag} /> : null}
          <span className={cn('rounded-full border px-2 text-[11px] font-medium leading-5', tone(ev, now))}>{overdue ? 'Overdue' : STATUS_LABEL[ev.status]}</span>
        </div>
        <h2 className={cn('mt-2 text-xl font-semibold tracking-tight', cancelled && 'line-through opacity-60')}>{ev.title}</h2>
      </div>
      <CloseButton onClose={onClose} />
    </div>
  )

  return (
    <>
      <Dialog
        open
        variant="sheet"
        onClose={onClose}
        header={header}
        label={ev.title}
        footer={!cancelled ? (
          <>
            {ev.kind === 'event' ? <button type="button" className={btn} onClick={onEdit}><Pencil className="size-4" aria-hidden="true" /> Edit</button> : null}
            <button type="button" className={cn(btnGhost, 'mr-auto')} onClick={() => { setMsg(null); setConfirming(true) }}>Cancel this item</button>
          </>
        ) : undefined}
      >
        <dl className="divide-y divide-border border-y border-border">
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
                  <Checkbox checked={!!i.done_at} disabled={pending === 'tick' || !me || cancelled} onChange={() => tick(i)} className="w-full">
                    <span className={i.done_at ? 'text-muted-foreground line-through' : ''}>{i.text}</span>
                    {i.done_at ? <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">{i.done_by}, {dateTimeLabel(i.done_at)}</span> : null}
                  </Checkbox>
                </li>
              ))}
            </ul>
            {!me ? <p className="mt-2 text-xs text-muted-foreground">Your name is still loading. Ticking becomes available in a moment.</p> : null}
            {under('tick')}
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
              {under('copy')}
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
                    <textarea id="resp" data-autofocus className={field + ' min-h-36 resize-y'} value={text} onChange={(e) => setText(e.target.value)} />
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Counts only. No patient data, passwords or keys. Text that looks like these is rejected.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button type="button" className={btnPrimary} disabled={pending === 'respond' || !text.trim()} onClick={respond}>
                        {pending === 'respond' ? 'Uploading…' : 'Upload and mark done'}
                      </button>
                      <button type="button" className={btn} disabled={pending === 'respond'} onClick={() => { setResponding(false); setMsg(null) }}>Not now</button>
                    </div>
                    {/* your text stays in the box if anything goes wrong */}
                    {under('respond')}
                  </div>
                ) : (
                  <div>
                    <div className="flex flex-wrap gap-2">
                      {ev.status === 'scheduled' ? (
                        <button type="button" className={btn} disabled={pending === 'ran'} onClick={() => run('ran', () => supabase.rpc('prompt_mark_ran', { p_tag: prompt.tag }), { ok: 'Marked as run.' })}>
                          {pending === 'ran' ? 'Saving…' : 'I ran it'}
                        </button>
                      ) : null}
                      <button type="button" className={btnPrimary} onClick={() => { setResponding(true); setMsg(null) }}>Respond</button>
                    </div>
                    {under('ran')}
                    {under('respond')}
                  </div>
                )}
              </section>
            ) : null}
          </>
        ) : null}
      </Dialog>

      <Dialog
        open={confirming}
        onClose={() => { if (pending !== 'cancel') setConfirming(false) }}
        title="Cancel this item?"
        size="sm"
        footer={
          <>
            <button type="button" className={btn} disabled={pending === 'cancel'} onClick={() => setConfirming(false)}>Keep it</button>
            <button type="button" data-autofocus className={cn(btn, '!border-destructive !text-destructive hover:!bg-destructive/10')} disabled={pending === 'cancel'} onClick={cancelItem}>
              {pending === 'cancel' ? 'Cancelling…' : 'Yes, cancel it'}
            </button>
          </>
        }
      >
        <p className="text-sm leading-6 text-muted-foreground">“{ev.title}” stays in the calendar, marked as cancelled. Nothing is deleted.</p>
        {under('cancel')}
      </Dialog>
    </>
  )
}
