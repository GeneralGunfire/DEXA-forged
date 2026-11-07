import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import {
  ACCEPT_DOC, checkFile, describe, downloadFile, fileKind, fmtBytes, fmtDate, removeFiles, signedUrl,
  unwrap, uploadFile, useLoad, useTeam,
} from '../../lib/data'
import { Dialog, EmptyState, Field, LoadState, PageHead } from '../../components/ui'
import { sectionByPath } from './sections'
import './pages.css'

export type DocRow = {
  id: string; name: string; path: string; mime: string | null; size: number | null
  database_id: string | null; created_by: string; created_at: string
}

const stripExt = (n: string) => n.replace(/\.[^.]+$/, '')

/** Used by the Documents page (databaseId = null) and by each database's Documents tab. */
export function DocumentsPanel({ databaseId = null }: { databaseId?: string | null }) {
  const { name: who } = useTeam()
  const { data, error, loading, reload } = useLoad<DocRow[]>(async () => {
    let q = supabase.from('documents').select('*').order('created_at', { ascending: false })
    q = databaseId ? q.eq('database_id', databaseId) : q.is('database_id', null)
    return unwrap<DocRow[]>(await q) ?? []
  }, [databaseId])

  const [q, setQ] = useState('')
  const [uploading, setUploading] = useState(false)
  const [renaming, setRenaming] = useState<DocRow | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const rows = (data ?? []).filter((d) => d.name.toLowerCase().includes(q.trim().toLowerCase()))

  async function open(d: DocRow) {
    try { window.open(await signedUrl(d.path), '_blank', 'noopener') } catch (e) { setMsg(describe(e)) }
  }
  async function download(d: DocRow) {
    try { await downloadFile(d.path, d.name) } catch (e) { setMsg(describe(e)) }
  }
  async function remove(d: DocRow) {
    if (!window.confirm(`Delete "${d.name}"? This cannot be undone.`)) return
    try {
      unwrap(await supabase.from('documents').delete().eq('id', d.id))
      await removeFiles([d.path])
      reload()
    } catch (e) { setMsg(describe(e)) }
  }

  return (
    <>
      <div className="bar">
        <input className="search" type="search" placeholder="Search documents" aria-label="Search documents" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="btn btn--dark" onClick={() => setUploading(true)}>Upload files</button>
      </div>

      {msg && <p className="notice notice--err" role="alert">{msg}</p>}

      <LoadState loading={loading && !data} error={error}>
        {rows.length === 0 ? (
          <EmptyState
            title={data && data.length ? 'No documents match your search.' : 'No documents yet.'}
            text={data && data.length ? undefined : 'PDF, Word, MP4, JPEG and PNG files, up to 50 MB each.'}
          />
        ) : (
          <div className="rows">
            {rows.map((d) => (
              <div className="item" key={d.id}>
                <span className="item__ico">{fileKind(d.mime, d.name).toUpperCase().slice(0, 4)}</span>
                <div className="item__main">
                  <p className="item__title" title={d.name}>{d.name}</p>
                  <p className="item__meta">
                    {[fmtBytes(d.size), fmtDate(d.created_at), who(d.created_by) && `by ${who(d.created_by)}`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="item__acts">
                  <button type="button" className="btn btn--sm" onClick={() => open(d)}>View</button>
                  <button type="button" className="btn btn--sm" onClick={() => download(d)}>Download</button>
                  <button type="button" className="btn btn--sm" onClick={() => setRenaming(d)}>Rename</button>
                  <button type="button" className="btn btn--sm btn--danger" onClick={() => remove(d)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </LoadState>

      <UploadDialog open={uploading} onClose={() => setUploading(false)} databaseId={databaseId} onDone={reload} />
      <RenameDialog doc={renaming} onClose={() => setRenaming(null)} onDone={reload} />
    </>
  )
}

function UploadDialog({
  open, onClose, databaseId, onDone,
}: { open: boolean; onClose: () => void; databaseId: string | null; onDone: () => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  function close() { setFiles([]); setName(''); setErr(null); setProgress(null); onClose() }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!files.length) return setErr('Choose at least one file.')
    for (const f of files) {
      const bad = checkFile(f, ACCEPT_DOC)
      if (bad) return setErr(bad)
    }
    try {
      for (let i = 0; i < files.length; i++) {
        setProgress(`Uploading ${i + 1} of ${files.length}…`)
        const f = files[i]
        const up = await uploadFile(f, databaseId ? `databases/${databaseId}` : 'documents')
        const display = files.length === 1 && name.trim() ? name.trim() : stripExt(f.name)
        unwrap(await supabase.from('documents').insert({ name: display, path: up.path, mime: up.mime, size: up.size, database_id: databaseId }))
      }
      onDone()
      close()
    } catch (ex) {
      setProgress(null)
      setErr(describe(ex))
    }
  }

  return (
    <Dialog open={open} onClose={close} title="Upload documents">
      <form onSubmit={submit}>
        <Field label="Files" hint="PDF, Word, MP4, JPEG or PNG. Up to 50 MB each.">
          <input
            type="file" multiple accept={ACCEPT_DOC}
            onChange={(e) => { const f = Array.from(e.target.files ?? []); setFiles(f); if (f.length === 1) setName(stripExt(f[0].name)) }}
          />
        </Field>
        {files.length === 1 && (
          <Field label="Name"><input type="text" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} /></Field>
        )}
        {files.length > 1 && <p className="muted" style={{ marginBottom: 12 }}>{files.length} files selected. Each keeps its file name; you can rename them afterwards.</p>}
        {err && <p className="formerr" role="alert">{err}</p>}
        <div className="dlg__foot">
          <button type="button" className="btn" onClick={close}>Cancel</button>
          <button type="submit" className="btn btn--dark" disabled={!!progress}>{progress ?? 'Upload'}</button>
        </div>
      </form>
    </Dialog>
  )
}

function RenameDialog({ doc, onClose, onDone }: { doc: DocRow | null; onClose: () => void; onDone: () => void }) {
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim()
    if (!doc || !name) return setErr('Enter a name.')
    setBusy(true)
    try {
      unwrap(await supabase.from('documents').update({ name }).eq('id', doc.id))
      onDone(); onClose()
    } catch (ex) { setErr(describe(ex)) } finally { setBusy(false) }
  }

  return (
    <Dialog open={!!doc} onClose={onClose} title="Rename document">
      {doc && (
        <form key={doc.id} onSubmit={submit}>
          <Field label="Name"><input type="text" name="name" autoFocus defaultValue={doc.name} maxLength={200} /></Field>
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

export default function Documents() {
  const s = sectionByPath('documents')
  return (
    <div className="pg">
      <PageHead title={s.label} blurb={s.blurb} />
      <DocumentsPanel />
    </div>
  )
}
