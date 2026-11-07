import { useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { describe, fmtDate, unwrap, useLoad } from '../../lib/data'
import { Chip, Dialog, EmptyState, Field, LoadState, PageHead } from '../../components/ui'
import { Bar, Stars } from '../../components/viz'
import { sectionByPath } from './sections'
import './pages.css'

export type FeedbackRow = {
  id: string; source: 'explorer' | 'forged' | 'other'; page: string; rating: number | null; message: string
  contact: string; tags: string[]; status: 'new' | 'reviewing' | 'done'; note: string; created_at: string
}

const STATUS: { v: FeedbackRow['status']; label: string }[] = [
  { v: 'new', label: 'New' }, { v: 'reviewing', label: 'Reviewing' }, { v: 'done', label: 'Done' },
]

export const average = (rows: { rating: number | null }[]) => {
  const r = rows.filter((x) => x.rating != null) as { rating: number }[]
  return r.length ? r.reduce((s, x) => s + x.rating, 0) / r.length : null
}

function timeAgo(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  if (s < 86400 * 14) return `${Math.round(s / 86400)} days ago`
  return fmtDate(iso)
}

export default function Feedback() {
  const s = sectionByPath('feedback')
  const { data, error, loading, reload } = useLoad<FeedbackRow[]>(async () =>
    unwrap<FeedbackRow[]>(await supabase.from('feedback').select('*').order('created_at', { ascending: false })) ?? [])

  const [status, setStatus] = useState<'all' | FeedbackRow['status']>('all')
  const [rating, setRating] = useState<'all' | 'low' | 'high'>('all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<FeedbackRow | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const all = data ?? []
  const rows = useMemo(() => all.filter((f) =>
    (status === 'all' || f.status === status) &&
    (rating === 'all' || (rating === 'low' ? (f.rating ?? 5) <= 2 : (f.rating ?? 0) >= 4)) &&
    (!q.trim() || `${f.message} ${f.page} ${f.tags.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()))), [all, status, rating, q])

  const avg = average(all)
  const counts = [5, 4, 3, 2, 1].map((n) => ({ n, c: all.filter((f) => f.rating === n).length }))
  const maxC = Math.max(1, ...counts.map((x) => x.c))
  const fresh = all.filter((f) => f.status === 'new').length

  async function setRowStatus(f: FeedbackRow, next: FeedbackRow['status']) {
    try { unwrap(await supabase.from('feedback').update({ status: next }).eq('id', f.id)); reload() } catch (e) { setMsg(describe(e)) }
  }
  async function remove(f: FeedbackRow) {
    if (!window.confirm('Delete this feedback? This cannot be undone.')) return
    try { unwrap(await supabase.from('feedback').delete().eq('id', f.id)); reload() } catch (e) { setMsg(describe(e)) }
  }

  return (
    <div className="pg">
      <PageHead title={s.label} blurb={s.blurb} />
      {msg && <p className="notice notice--err" role="alert">{msg}</p>}

      <LoadState loading={loading && !data} error={error}>
        {all.length === 0 ? (
          <EmptyState title="No feedback yet." text="Feedback sent from the public explorer arrives here, newest first." />
        ) : (
          <>
            <div className="fbsum">
              <div className="fbsum__card"><strong>{all.length}</strong><span>responses</span></div>
              <div className="fbsum__card"><strong>{fresh}</strong><span>new, not yet read</span></div>
              <div className="fbsum__card">
                <strong>{avg != null ? avg.toFixed(1) : '–'}</strong>
                <span>average rating</span>
                {avg != null && <Stars value={Math.round(avg)} size={14} />}
              </div>
              <div className="fbsum__card fbsum__dist" aria-label="Ratings">
                {counts.map((x) => <Bar key={x.n} label={`${x.n}★`} value={x.c} max={maxC} tone={x.n >= 4 ? 'good' : x.n === 3 ? 'warn' : 'bad'} />)}
              </div>
            </div>

            <div className="bar">
              <input className="search" type="search" placeholder="Search feedback" aria-label="Search feedback" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="seg" role="group" aria-label="Status">
                {(['all', ...STATUS.map((x) => x.v)] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={status === v} onClick={() => setStatus(v)}>{v === 'all' ? 'All' : STATUS.find((x) => x.v === v)!.label}</button>
                ))}
              </div>
              <div className="seg" role="group" aria-label="Rating">
                <button type="button" aria-pressed={rating === 'all'} onClick={() => setRating('all')}>Any rating</button>
                <button type="button" aria-pressed={rating === 'high'} onClick={() => setRating('high')}>4–5 stars</button>
                <button type="button" aria-pressed={rating === 'low'} onClick={() => setRating('low')}>1–2 stars</button>
              </div>
            </div>

            {rows.length === 0 ? (
              <EmptyState title="Nothing matches." text="Clear the search or the filters." />
            ) : (
              <div className="fblist">
                {rows.map((f) => (
                  <article className={`fbitem${f.status === 'new' ? ' is-new' : ''}`} key={f.id}>
                    <div className="fbitem__top">
                      <Stars value={f.rating} />
                      <span className="fbitem__meta">
                        {f.page && <code>{f.page}</code>}
                        <span>{timeAgo(f.created_at)}</span>
                        {f.contact && <span title="Contact left by the sender">{f.contact}</span>}
                      </span>
                      <span className="fbitem__acts">
                        <select className="miniselect" value={f.status} onChange={(e) => setRowStatus(f, e.target.value as FeedbackRow['status'])} aria-label="Status">
                          {STATUS.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}
                        </select>
                        <button type="button" className="btn btn--sm" onClick={() => setOpen(f)}>Triage</button>
                        <button type="button" className="btn btn--sm btn--danger" onClick={() => remove(f)}>Delete</button>
                      </span>
                    </div>
                    {f.message && <p className="fbitem__msg">{f.message}</p>}
                    {(f.tags.length > 0 || f.note) && (
                      <div className="fbitem__foot">
                        {f.tags.map((t) => <Chip key={t}>{t}</Chip>)}
                        {f.note && <span className="fbitem__note">Note: {f.note}</span>}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </LoadState>

      <Dialog open={!!open} onClose={() => setOpen(null)} title="Triage feedback">
        {open && <TriageForm key={open.id} row={open} onClose={() => setOpen(null)} onDone={reload} />}
      </Dialog>
    </div>
  )
}

function TriageForm({ row, onClose, onDone }: { row: FeedbackRow; onClose: () => void; onDone: () => void }) {
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const tags = String(fd.get('tags') ?? '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 12)
    setBusy(true)
    try {
      unwrap(await supabase.from('feedback').update({
        status: String(fd.get('status')), tags, note: String(fd.get('note') ?? '').slice(0, 2000),
      }).eq('id', row.id))
      onDone(); onClose()
    } catch (ex) { setErr(describe(ex)) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit}>
      {row.message && <p className="fbitem__msg" style={{ marginBottom: 14 }}>{row.message}</p>}
      <div className="row2">
        <Field label="Status">
          <select name="status" defaultValue={row.status}>{STATUS.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}</select>
        </Field>
        <Field label="Tags" hint="Comma separated, e.g. map, journeys, bug">
          <input type="text" name="tags" defaultValue={row.tags.join(', ')} maxLength={200} />
        </Field>
      </div>
      <Field label="Private note"><textarea name="note" rows={3} maxLength={2000} defaultValue={row.note} /></Field>
      {err && <p className="formerr" role="alert">{err}</p>}
      <div className="dlg__foot">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn--dark" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  )
}
