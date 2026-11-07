import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import {
  checkFile, describe, downloadFile, fileKind, fmtBytes, fmtDate, removeFiles, signedUrl, unwrap, uploadFile,
  useLoad, useSignedUrl,
} from '../../lib/data'
import { Chip, Dialog, EmptyState, Field, LoadState, PageHead } from '../../components/ui'
import { sectionByPath } from './sections'
import './pages.css'

const ACCEPT = '.png,.jpg,.jpeg,.mp4,.pdf'
const LABELS = ['Logo', 'Image', 'App screenshot', 'Video', 'Document', 'Other']

type Asset = {
  id: string; name: string; label: string; path: string; mime: string | null; size: number | null
  created_by: string; created_at: string
}

const stripExt = (n: string) => n.replace(/\.[^.]+$/, '')
const guessLabel = (f: File) => (f.type.startsWith('video/') ? 'Video' : f.type === 'application/pdf' ? 'Document' : 'Image')

function Preview({ a }: { a: Asset }) {
  const url = useSignedUrl(a.path)
  const kind = fileKind(a.mime, a.name)
  if (kind === 'Image' && url) return <img src={url} alt={a.name} loading="lazy" />
  if (kind === 'Video' && url) return <video src={url} controls preload="metadata" />
  return <span>{kind === 'Image' || kind === 'Video' ? '…' : kind.toUpperCase()}</span>
}

export default function Branding() {
  const s = sectionByPath('branding')
  const { data, error, loading, reload } = useLoad<Asset[]>(async () =>
    unwrap<Asset[]>(await supabase.from('brand_assets').select('*').order('created_at', { ascending: false })) ?? [])

  const [filter, setFilter] = useState('All')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Asset | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const labels = ['All', ...Array.from(new Set((data ?? []).map((a) => a.label).filter(Boolean)))]
  const rows = (data ?? []).filter((a) => filter === 'All' || a.label === filter)

  async function view(a: Asset) {
    try { window.open(await signedUrl(a.path), '_blank', 'noopener') } catch (e) { setMsg(describe(e)) }
  }
  async function download(a: Asset) {
    try { await downloadFile(a.path, a.name) } catch (e) { setMsg(describe(e)) }
  }
  async function remove(a: Asset) {
    if (!window.confirm(`Delete "${a.name}"? This cannot be undone.`)) return
    try {
      unwrap(await supabase.from('brand_assets').delete().eq('id', a.id))
      await removeFiles([a.path])
      reload()
    } catch (e) { setMsg(describe(e)) }
  }

  return (
    <div className="pg">
      <PageHead title={s.label} blurb={s.blurb} action={<button type="button" className="btn btn--dark" onClick={() => setAdding(true)}>Upload asset</button>} />

      {msg && <p className="notice notice--err" role="alert">{msg}</p>}

      <LoadState loading={loading && !data} error={error}>
        {data && data.length > 0 && labels.length > 2 && (
          <div className="bar">
            <div className="seg" role="group" aria-label="Filter by label">
              {labels.map((l) => (
                <button key={l} type="button" aria-pressed={filter === l} onClick={() => setFilter(l)}>{l}</button>
              ))}
            </div>
          </div>
        )}
        {rows.length === 0 ? (
          <EmptyState title="No brand assets yet." text="Upload PNG, JPEG, MP4 or PDF files and give each a name and label." />
        ) : (
          <div className="tiles">
            {rows.map((a) => (
              <article className="tile" key={a.id}>
                <div className="tile__prev"><Preview a={a} /></div>
                <div className="tile__body">
                  <p className="tile__name" title={a.name}>{a.name}</p>
                  <p className="tile__meta">{[fmtBytes(a.size), fmtDate(a.created_at)].filter(Boolean).join(' · ')}</p>
                  {a.label && <div><Chip>{a.label}</Chip></div>}
                  <div className="tile__acts">
                    <button type="button" className="btn btn--sm" onClick={() => view(a)}>View</button>
                    <button type="button" className="btn btn--sm" onClick={() => download(a)}>Download</button>
                    <button type="button" className="btn btn--sm" onClick={() => setEditing(a)}>Edit</button>
                    <button type="button" className="btn btn--sm btn--danger" onClick={() => remove(a)}>Delete</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </LoadState>

      <AddDialog open={adding} onClose={() => setAdding(false)} onDone={reload} />
      <EditDialog asset={editing} onClose={() => setEditing(null)} onDone={reload} />
    </div>
  )
}

function LabelSelect({ defaultValue }: { defaultValue: string }) {
  return (
    <>
      <input type="text" name="label" list="brand-labels" maxLength={60} defaultValue={defaultValue} placeholder="What is this asset?" />
      <datalist id="brand-labels">{LABELS.map((l) => <option key={l} value={l} />)}</datalist>
    </>
  )
}

function AddDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function close() { setFile(null); setErr(null); onClose() }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const name = String(fd.get('name') ?? '').trim()
    const label = String(fd.get('label') ?? '').trim()
    if (!file) return setErr('Choose a file.')
    if (!name) return setErr('Enter a name.')
    const bad = checkFile(file, ACCEPT)
    if (bad) return setErr(bad)
    setBusy(true)
    try {
      const up = await uploadFile(file, 'brand')
      unwrap(await supabase.from('brand_assets').insert({ name, label, path: up.path, mime: up.mime, size: up.size }))
      onDone(); close()
    } catch (ex) { setErr(describe(ex)) } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onClose={close} title="Upload brand asset">
      <form onSubmit={submit}>
        <Field label="File" hint="PNG, JPEG, MP4 or PDF. Up to 50 MB.">
          <input type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        <Field label="Name">
          <input key={file?.name ?? 'none'} type="text" name="name" maxLength={200} defaultValue={file ? stripExt(file.name) : ''} placeholder="e.g. DEXA logo, navy" />
        </Field>
        <Field label="Label" hint="A short description, e.g. Logo, App screenshot, Promo video."><LabelSelect key={file?.name ?? 'none'} defaultValue={file ? guessLabel(file) : 'Image'} /></Field>
        {err && <p className="formerr" role="alert">{err}</p>}
        <div className="dlg__foot">
          <button type="button" className="btn" onClick={close}>Cancel</button>
          <button type="submit" className="btn btn--dark" disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</button>
        </div>
      </form>
    </Dialog>
  )
}

function EditDialog({ asset, onClose, onDone }: { asset: Asset | null; onClose: () => void; onDone: () => void }) {
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const name = String(fd.get('name') ?? '').trim()
    if (!asset || !name) return setErr('Enter a name.')
    setBusy(true)
    try {
      unwrap(await supabase.from('brand_assets').update({ name, label: String(fd.get('label') ?? '').trim() }).eq('id', asset.id))
      onDone(); onClose()
    } catch (ex) { setErr(describe(ex)) } finally { setBusy(false) }
  }

  return (
    <Dialog open={!!asset} onClose={onClose} title="Edit asset">
      {asset && (
        <form key={asset.id} onSubmit={submit}>
          <Field label="Name"><input type="text" name="name" autoFocus defaultValue={asset.name} maxLength={200} /></Field>
          <Field label="Label"><LabelSelect defaultValue={asset.label} /></Field>
          {err && <p className="formerr" role="alert">{err}</p>}
          <div className="dlg__foot">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn--dark" disabled={busy}>Save</button>
          </div>
        </form>
      )}
    </Dialog>
  )
}
