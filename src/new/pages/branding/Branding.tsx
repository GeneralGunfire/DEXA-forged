import { useMemo, useState, type FormEvent } from 'react'
import { Download, ExternalLink, FileText, Pencil, Plus, Upload, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import {
  checkFile, describe, downloadFile, fileKind, fmtBytes, fmtDate, signedUrl, unwrap, uploadFile, useLoad, useSignedUrl,
} from '../../../lib/data'
import { btn, btnGhost, btnPrimary, field, label } from '../calendar/cal'
import { cn } from '@/lib/utils'

const ACCEPT = '.png,.jpg,.jpeg,.mp4,.pdf'
const LABELS = ['Logo', 'Image', 'App screenshot', 'Video', 'Document', 'Other']
type Asset = { id: string; name: string; label: string; path: string; mime: string | null; size: number | null; created_by: string; created_at: string }

const stripExt = (n: string) => n.replace(/\.[^.]+$/, '')
const guessLabel = (f: File) => (f.type.startsWith('video/') ? 'Video' : f.type === 'application/pdf' ? 'Document' : 'Image')

function Preview({ a }: { a: Asset }) {
  const url = useSignedUrl(a.path)
  const kind = fileKind(a.mime, a.name)
  return (
    <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-xl border border-border bg-muted">
      {kind === 'Image' && url ? <img src={url} alt={a.name} loading="lazy" className="size-full object-contain p-3" />
        : kind === 'Video' && url ? <video src={url} controls preload="metadata" className="size-full object-contain" />
        : <span className="flex flex-col items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"><FileText className="size-8" aria-hidden="true" />{kind === 'Image' || kind === 'Video' ? 'Loading…' : kind}</span>}
    </div>
  )
}

export default function Branding() {
  const { data, error, loading, reload } = useLoad<Asset[]>(async () =>
    unwrap<Asset[]>(await supabase.from('brand_assets').select('*').order('created_at', { ascending: false })) ?? [])
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Asset | null>(null)
  const [filter, setFilter] = useState('All')
  const [msg, setMsg] = useState<string | null>(null)

  const all = data ?? []
  const labels = useMemo(() => ['All', ...Array.from(new Set(all.map((a) => a.label || 'Unlabelled')))], [all])
  const groups = useMemo(() => {
    const by = new Map<string, Asset[]>()
    for (const a of all) {
      const k = a.label || 'Unlabelled'
      if (filter !== 'All' && filter !== k) continue
      by.set(k, [...(by.get(k) ?? []), a])
    }
    return [...by.entries()]
  }, [all, filter])

  const view = async (a: Asset) => { try { window.open(await signedUrl(a.path), '_blank', 'noopener') } catch (e) { setMsg(describe(e)) } }
  const download = async (a: Asset) => { try { await downloadFile(a.path, a.name) } catch (e) { setMsg(describe(e)) } }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-24 pt-8 sm:px-8 sm:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Admin</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Branding</h1>
          <p className="mt-2 text-sm text-muted-foreground">DEXA logos, images and videos, uploaded and labelled in one place.</p>
        </div>
        <button type="button" className={btnPrimary} onClick={() => setAdding(true)}><Upload className="size-4" aria-hidden="true" /> Upload asset</button>
      </header>

      {msg ? <p className="mt-6 rounded-md border border-destructive/60 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{msg}</p> : null}

      {all.length > 0 && labels.length > 2 ? (
        <div className="mt-8 flex flex-wrap gap-1.5" role="group" aria-label="Filter by label">
          {labels.map((l) => (
            <button key={l} type="button" aria-pressed={filter === l} onClick={() => setFilter(l)}
              className={cn('rounded-full border px-3 py-1 text-sm transition-colors', filter === l ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}>
              {l}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-10">
        {error ? (
          <p className="text-sm text-destructive" role="alert">Could not load the assets: {error}</p>
        ) : loading && !data ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : all.length === 0 ? (
          <div className="border-t border-border py-16 text-center">
            <p className="text-lg font-medium">No brand assets yet.</p>
            <p className="mt-2 text-sm text-muted-foreground">Upload PNG, JPEG, MP4 or PDF files and give each a name and label.</p>
            <button type="button" className={btnPrimary + ' mt-6'} onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden="true" /> Upload asset</button>
          </div>
        ) : (
          <div className="space-y-14">
            {groups.map(([k, list]) => (
              <section key={k} className="border-t border-border pt-6">
                <h2 className="mb-6 flex items-baseline gap-3 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  {k}<span className="tabular-nums normal-case tracking-normal">{list.length}</span>
                </h2>
                <ul className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((a) => (
                    <li key={a.id}>
                      <Preview a={a} />
                      <p className="mt-3 truncate text-sm font-medium" title={a.name}>{a.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{[fileKind(a.mime, a.name), fmtBytes(a.size), fmtDate(a.created_at)].filter(Boolean).join(' · ')}</p>
                      <div className="-ml-2 mt-2 flex flex-wrap gap-0.5">
                        <button type="button" className={btnGhost + ' !h-8 !px-2'} onClick={() => view(a)}><ExternalLink className="size-3.5" aria-hidden="true" /> View</button>
                        <button type="button" className={btnGhost + ' !h-8 !px-2'} onClick={() => download(a)}><Download className="size-3.5" aria-hidden="true" /> Download</button>
                        <button type="button" className={btnGhost + ' !h-8 !px-2'} onClick={() => setEditing(a)}><Pencil className="size-3.5" aria-hidden="true" /> Edit</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {adding ? <AssetForm onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload() }} /> : null}
      {editing ? <AssetForm asset={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload() }} /> : null}
    </div>
  )
}

/** Upload a new asset, or rename and relabel an existing one. */
function AssetForm({ asset, onClose, onDone }: { asset?: Asset; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState(asset?.name ?? '')
  const [lbl, setLbl] = useState(asset?.label ?? 'Image')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!name.trim()) return setErr('Enter a name.')
    setBusy(true); setErr(null)
    try {
      if (asset) {
        unwrap(await supabase.from('brand_assets').update({ name: name.trim(), label: lbl.trim() }).eq('id', asset.id))
      } else {
        if (!file) throw new Error('Choose a file.')
        const bad = checkFile(file, ACCEPT)
        if (bad) throw new Error(bad)
        const up = await uploadFile(file, 'brand')
        unwrap(await supabase.from('brand_assets').insert({ name: name.trim(), label: lbl.trim(), path: up.path, mime: up.mime, size: up.size }))
      }
      onDone()
    } catch (ex) {
      setErr(describe(ex))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label={asset ? 'Edit asset' : 'Upload brand asset'}>
      <form onSubmit={submit} className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">{asset ? 'Edit asset' : 'Upload brand asset'}</h2>
          <button type="button" onClick={onClose} className={btnGhost + ' !px-2'} aria-label="Close"><X className="size-4" aria-hidden="true" /></button>
        </div>
        <div className="space-y-5">
          {!asset ? (
            <div>
              <label className={label} htmlFor="b-file">File</label>
              <input id="b-file" type="file" accept={ACCEPT} className={field + ' file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-foreground'}
                onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f) { setName(stripExt(f.name)); setLbl(guessLabel(f)) } }} />
              <p className="mt-1.5 text-xs text-muted-foreground">PNG, JPEG, MP4 or PDF. Up to 50 MB.</p>
            </div>
          ) : null}
          <div>
            <label className={label} htmlFor="b-name">Name</label>
            <input id="b-name" className={field} value={name} maxLength={200} onChange={(e) => setName(e.target.value)} placeholder="e.g. DEXA logo, navy" autoFocus={!!asset} />
          </div>
          <div>
            <label className={label} htmlFor="b-label">Label</label>
            <input id="b-label" className={field} list="nf-brand-labels" value={lbl} maxLength={60} onChange={(e) => setLbl(e.target.value)} placeholder="What is this asset?" />
            <datalist id="nf-brand-labels">{LABELS.map((l) => <option key={l} value={l} />)}</datalist>
          </div>
        </div>
        {err ? <p className="mt-5 rounded-md border border-destructive/60 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{err}</p> : null}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className={btn} onClick={onClose}>Cancel</button>
          <button type="submit" className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : asset ? 'Save' : 'Upload'}</button>
        </div>
      </form>
    </div>
  )
}
