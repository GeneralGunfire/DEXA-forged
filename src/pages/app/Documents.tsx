import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import {
  ACCEPT_DOC, checkFile, describe, downloadFile, fileKind, fmtBytes, fmtDate, removeFiles, signedUrl,
  unwrap, uploadFile, useLoad, useTeam,
} from '../../lib/data'
import { Dialog, EmptyState, Field, LoadState, PageHead } from '../../components/ui'
import { DocViewer } from '../../components/DocViewer'
import { StatTiles } from '../../components/charts'
import { sectionByPath } from './sections'
import './pages.css'
import { useFeedback } from '../../components/feedback'
import { useOpenFromQuery } from '../../components/nav'

export type DocRow = {
  id: string; name: string; path: string; mime: string | null; size: number | null
  database_id: string | null; created_by: string; created_at: string; folder?: string
}

const stripExt = (n: string) => n.replace(/\.[^.]+$/, '')

/** Used by the Documents page (databaseId = null) and by each database's Documents tab. */
export function DocumentsPanel({ databaseId = null }: { databaseId?: string | null }) {
  const { confirm } = useFeedback()
  const { name: who } = useTeam()
  const { data, error, loading, reload } = useLoad<DocRow[]>(async () => {
    let q = supabase.from('documents').select('*').order('created_at', { ascending: false })
    q = databaseId ? q.eq('database_id', databaseId) : q.is('database_id', null)
    return unwrap<DocRow[]>(await q) ?? []
  }, [databaseId])

  const [q, setQ] = useState('')
  const [uploading, setUploading] = useState(false)
  useOpenFromQuery('upload', () => { if (!databaseId) setUploading(true) })
  const [renaming, setRenaming] = useState<DocRow | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const folders = [...new Set((data ?? []).map((d) => d.folder ?? '').filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const rows = (data ?? []).filter((d) => `${d.name} ${d.folder ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))

  const [viewing, setViewing] = useState<{ name: string; path: string; mime: string | null } | null>(null)
  async function open(d: { name: string; path: string; mime: string | null }) {
    if (['PDF', 'Image'].includes(fileKind(d.mime, d.name))) return setViewing(d)
    try { window.open(await signedUrl(d.path), '_blank', 'noopener') } catch (e) { setMsg(describe(e)) }
  }
  async function download(d: { name: string; path: string }) {
    try { await downloadFile(d.path, d.name) } catch (e) { setMsg(describe(e)) }
  }
  async function remove(d: DocRow) {
    if (!await confirm(`Delete "${d.name}"? This cannot be undone.`)) return
    try {
      unwrap(await supabase.from('documents').delete().eq('id', d.id))
      await removeFiles([d.path])
      reload()
    } catch (e) { setMsg(describe(e)) }
  }

  return (
    <>
      {!databaseId && (data ?? []).length > 0 && (() => {
        const all = data ?? []
        const bytes = all.reduce((t, d) => t + (d.size ?? 0), 0)
        const weekAgo = Date.now() - 7 * 86400000
        const kinds = new Set(all.map((d) => fileKind(d.mime, d.name)))
        return (
          <StatTiles items={[
            { value: all.length, label: all.length === 1 ? 'document' : 'documents' },
            { value: fmtBytes(bytes) || '0 B', label: 'stored in total' },
            { value: all.filter((d) => new Date(d.created_at).getTime() >= weekAgo).length, label: 'added this week' },
            { value: kinds.size, label: kinds.size === 1 ? 'file type' : 'file types', hint: [...kinds].join(', ') },
          ]} />
        )
      })()}

      <div className="bar">
        <input className="search" type="search" placeholder="Search documents" aria-label="Search documents" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="btn btn--dark" onClick={() => setUploading(true)}>Upload files</button>
      </div>

      {msg && <p className="notice notice--err" role="alert">{msg}</p>}

      {!databaseId && <DatabaseDocsFolder q={q} onView={open} onDownload={download} />}

      <LoadState loading={loading && !data} error={error}>
        {rows.length === 0 ? (
          <EmptyState
            title={data && data.length ? 'No documents match your search.' : 'No documents yet.'}
            text={data && data.length ? undefined : 'PDF, Word, MP4, JPEG and PNG files, up to 50 MB each.'}
          />
        ) : (
          <>
            {(() => {
              const row = (d: DocRow) => (
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
              )
              const loose = rows.filter((d) => !d.folder)
              const groups = [...new Set(rows.filter((d) => d.folder).map((d) => d.folder as string))].sort((a, b) => a.localeCompare(b))
              return (
                <>
                  {groups.map((g) => {
                    const inG = rows.filter((d) => d.folder === g)
                    return (
                      <details className="fold" key={g} open>
                        <summary>
                          <svg className="fold__chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
                          <strong>{g}</strong>
                          <span className="fold__n">{inG.length}</span>
                        </summary>
                        <div className="rows">{inG.map(row)}</div>
                      </details>
                    )
                  })}
                  {loose.length > 0 && <div className="rows">{loose.map(row)}</div>}
                </>
              )
            })()}
          </>
        )}
      </LoadState>

      <DocViewer doc={viewing} onClose={() => setViewing(null)} />
      <UploadDialog open={uploading} onClose={() => setUploading(false)} databaseId={databaseId} folders={folders} onDone={reload} />
      <RenameDialog doc={renaming} folders={folders} onClose={() => setRenaming(null)} onDone={reload} />
    </>
  )
}

type DbDocRow = { id: string; name: string; path: string; mime: string | null; size: number | null; document_date: string; databases: { name: string } | { name: string }[] | null }
const dbName = (d: DbDocRow) => (Array.isArray(d.databases) ? d.databases[0]?.name : d.databases?.name) ?? ''

/** A read-only folder of every database's current official document. The files stay under each database's own
 *  Documents tab; this is the same file, listed here too, so nothing is copied or uploaded twice. */
function DatabaseDocsFolder({ q, onView, onDownload }: {
  q: string
  onView: (d: { name: string; path: string; mime: string | null }) => void
  onDownload: (d: { name: string; path: string }) => void
}) {
  const { data } = useLoad<DbDocRow[]>(async () =>
    unwrap<DbDocRow[]>(await supabase.from('db_documents').select('id, name, path, mime, size, document_date, databases(name)').eq('is_current', true).order('document_date', { ascending: false }).order('name')) ?? [])
  const all = data ?? []
  const needle = q.trim().toLowerCase()
  const rows = all.filter((d) => !needle || `${d.name} ${dbName(d)}`.toLowerCase().includes(needle))
  if (all.length === 0 || rows.length === 0) return null
  return (
    <details className="fold" open>
      <summary>
        <svg className="fold__chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
        <strong>Current database documents</strong>
        <span className="fold__n">{rows.length}</span>
      </summary>
      <p className="muted fold__note">Always the latest version for each database, listed here automatically. Manage them on each database's Documents tab.</p>
      <div className="rows">
        {rows.map((d) => (
          <div className="item" key={d.id}>
            <span className="item__ico">{fileKind(d.mime, d.name).toUpperCase().slice(0, 4)}</span>
            <div className="item__main">
              <p className="item__title" title={d.name}>{d.name}</p>
              <p className="item__meta">{[dbName(d), fmtBytes(d.size), fmtDate(d.document_date)].filter(Boolean).join(' · ')}</p>
            </div>
            <div className="item__acts">
              <button type="button" className="btn btn--sm" onClick={() => onView(d)}>View</button>
              <button type="button" className="btn btn--sm" onClick={() => onDownload(d)}>Download</button>
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}

function UploadDialog({
  open, onClose, databaseId, folders, onDone,
}: { open: boolean; onClose: () => void; databaseId: string | null; folders: string[]; onDone: () => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [name, setName] = useState('')
  const [folder, setFolder] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  function close() { setFiles([]); setName(''); setFolder(''); setErr(null); setProgress(null); onClose() }

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
        unwrap(await supabase.from('documents').insert({ name: display, path: up.path, mime: up.mime, size: up.size, database_id: databaseId, ...(!databaseId && folder.trim() ? { folder: folder.trim() } : {}) }))
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
        {!databaseId && (
          <Field label="Folder" hint="Optional. Pick one or type a new name.">
            <input type="text" list="doc-folders" value={folder} maxLength={80} placeholder="No folder" onChange={(e) => setFolder(e.target.value)} />
            <datalist id="doc-folders">{folders.map((f) => <option key={f} value={f} />)}</datalist>
          </Field>
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

function RenameDialog({ doc, folders, onClose, onDone }: { doc: DocRow | null; folders: string[]; onClose: () => void; onDone: () => void }) {
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const name = String(fd.get('name') ?? '').trim()
    const folder = String(fd.get('folder') ?? '').trim()
    if (!doc || !name) return setErr('Enter a name.')
    setBusy(true)
    try {
      unwrap(await supabase.from('documents').update({ name, ...(!doc.database_id && folder !== (doc.folder ?? '') ? { folder } : {}) }).eq('id', doc.id))
      onDone(); onClose()
    } catch (ex) { setErr(describe(ex)) } finally { setBusy(false) }
  }

  return (
    <Dialog open={!!doc} onClose={onClose} title={doc?.database_id ? 'Rename document' : 'Rename or move document'}>
      {doc && (
        <form key={doc.id} onSubmit={submit}>
          <Field label="Name"><input type="text" name="name" autoFocus defaultValue={doc.name} maxLength={200} /></Field>
          {!doc.database_id && (
            <Field label="Folder" hint="Leave empty for no folder.">
              <input type="text" name="folder" list="doc-folders2" defaultValue={doc.folder ?? ''} maxLength={80} />
              <datalist id="doc-folders2">{folders.map((f) => <option key={f} value={f} />)}</datalist>
            </Field>
          )}
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
