import { sha256Hex } from './hash.ts'
import { checkRedaction } from './redact.ts'
import type { TokenRow } from './ingest.ts'

/**
 * Request handling for the forge-docs Edge Function. Free of Deno and Supabase imports so it can be tested.
 * A docs token can list, fetch, add and describe documents. It cannot delete anything and it never changes a file's
 * content in place: a changed document is a NEW version that replaces the current one and keeps the old one as history.
 */

export const ACTIONS = ['list', 'get', 'upload', 'update']
export const RATE_LIMIT_PER_MINUTE = 60
export const MAX_FILE_BYTES = 4_000_000
export const MAX_BODY_CHARS = 5_600_000 // base64 of MAX_FILE_BYTES plus the details
export const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 200

/** extension -> mime and the first bytes a real file of that type starts with */
const TYPES: Record<string, { mime: string; magic: number[] }> = {
  pdf: { mime: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: [0x50, 0x4b, 0x03, 0x04] },
  png: { mime: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47] },
  jpg: { mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  jpeg: { mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
}

export type DocMeta = {
  ref: string            // "d:<uuid>" for a database document, "g:<uuid>" for a general one
  db: string             // database slug, or "estate" for the general Documents tab
  name: string; folder: string; tags: string[]; reason: string; made_by: string; description: string
  document_date: string | null; created_at: string; size: number | null; mime: string | null
  current: boolean; replaces: string | null
}
export type DocRef = { kind: 'db' | 'general'; id: string }
export type NewDoc = {
  kind: 'db' | 'general'; database_id: string | null; name: string; folder: string; tags: string[]; reason: string
  made_by: string; description: string; document_date: string | null; path: string; mime: string; size: number
  replaces_id: string | null; entry_id: string | null
}
export interface DocsStore {
  findToken(hash: string): Promise<(TokenRow & { scope: string }) | null>
  saveRate(tokenId: string, windowStart: string, count: number, usedAt: string): Promise<void>
  findDatabase(slug: string): Promise<{ id: string; slug: string } | null>
  listDocs(opts: { database_id: string | null | 'all'; folder: string | null; limit: number; history: boolean }): Promise<DocMeta[]>
  getDoc(ref: DocRef): Promise<(DocMeta & { path: string }) | null>
  findCurrentByName(kind: 'db' | 'general', databaseId: string | null, name: string): Promise<DocRef | null>
  putFile(path: string, bytes: Uint8Array, mime: string): Promise<void>        // never overwrites an existing file
  readFile(path: string): Promise<Uint8Array | null>
  insertDoc(d: NewDoc): Promise<DocRef>
  supersede(ref: DocRef): Promise<void>                                          // marks a document as no longer current
  updateDoc(ref: DocRef, patch: Partial<Pick<DocMeta, 'name' | 'folder' | 'tags' | 'reason' | 'description' | 'document_date'>>): Promise<void>
}

const json = (status: number, body: Record<string, unknown>, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...extra } })

const parseRef = (s: unknown): DocRef | null => {
  const m = typeof s === 'string' ? s.match(/^([dg]):([0-9a-f-]{36})$/i) : null
  return m ? { kind: m[1].toLowerCase() === 'd' ? 'db' : 'general', id: m[2].toLowerCase() } : null
}
const refText = (r: DocRef) => `${r.kind === 'db' ? 'd' : 'g'}:${r.id}`
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))

function toBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64.replace(/\s+/g, ''))
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch { return null }
}
function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
const safeName = (n: string) => n.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'file'

type Detail = { name?: string; folder?: string; tags?: string[]; reason?: string; description?: string; made_by?: string; document_date?: string | null }
/** Checks the text details shared by upload and update. Returns the cleaned values or an error. */
function details(b: Record<string, unknown>, need: { required: boolean }): { ok: true; v: Detail } | { ok: false; error: string } {
  const v: Detail = {}
  const text = (k: string, max: number): string | null | undefined => {
    if (b[k] === undefined) return undefined
    if (typeof b[k] !== 'string') return null
    const t = (b[k] as string).trim()
    return t.length <= max ? t : null
  }
  const name = text('name', 200); if (name === null || (name !== undefined && !name)) return { ok: false, error: 'The name must be 1 to 200 characters.' }
  if (name !== undefined) v.name = name
  const folder = text('folder', 80); if (folder === null) return { ok: false, error: 'The folder must be text of at most 80 characters.' }
  if (folder !== undefined) v.folder = folder
  const reason = text('reason', 500); if (reason === null) return { ok: false, error: 'The reason must be text of at most 500 characters.' }
  if (reason !== undefined) v.reason = reason
  const description = text('description', 2000); if (description === null) return { ok: false, error: 'The description must be text of at most 2000 characters.' }
  if (description !== undefined) v.description = description
  const madeBy = text('made_by', 60); if (madeBy === null) return { ok: false, error: 'made_by must be text of at most 60 characters.' }
  if (madeBy !== undefined) v.made_by = madeBy
  if (b.tags !== undefined) {
    if (!Array.isArray(b.tags) || b.tags.length > 10 || !b.tags.every((t) => typeof t === 'string' && /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,29}$/u.test(t.trim()))) {
      return { ok: false, error: 'tags must be a list of up to 10 short labels (letters, numbers, spaces, dots, dashes).' }
    }
    v.tags = [...new Set((b.tags as string[]).map((t) => t.trim().toLowerCase()))]
  }
  if (b.document_date !== undefined) {
    if (b.document_date !== null && (typeof b.document_date !== 'string' || !isDate(b.document_date))) return { ok: false, error: 'document_date must be a date like 2026-11-12.' }
    v.document_date = b.document_date as string | null
  }
  if (need.required && !v.reason) return { ok: false, error: 'A reason is required: say in a sentence why this document is being added or changed.' }
  const red = checkRedaction({ name: v.name, folder: v.folder, tags: v.tags?.join(' '), reason: v.reason, description: v.description, made_by: v.made_by })
  if (!red.ok) return { ok: false, error: red.message }
  return { ok: true, v }
}

export async function handleDocs(req: Request, store: DocsStore, now: Date = new Date()): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' }, { allow: 'POST' })

  const m = (req.headers.get('authorization') ?? '').match(/^Bearer\s+(\S+)$/i)
  if (!m) return json(401, { error: 'Missing docs token.' })
  const token = await store.findToken(await sha256Hex(m[1]))
  if (!token || token.revoked_at || token.scope !== 'docs') return json(401, { error: 'This docs token is not valid.' })

  const start = token.window_start ? new Date(token.window_start) : null
  const fresh = !start || now.getTime() - start.getTime() >= 60_000
  const count = fresh ? 1 : token.window_count + 1
  await store.saveRate(token.id, fresh ? now.toISOString() : token.window_start!, count, now.toISOString())
  if (count > RATE_LIMIT_PER_MINUTE) return json(429, { error: 'Too many requests. Wait a minute and try again.' }, { 'retry-after': '60' })

  const len = Number(req.headers.get('content-length') ?? 0)
  if (len > MAX_BODY_CHARS + 20_000) return json(413, { error: `The request is too large. A file can be at most ${MAX_FILE_BYTES / 1_000_000} MB.` })
  let b: Record<string, unknown>
  try {
    const raw = await req.json()
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error()
    b = raw as Record<string, unknown>
  } catch { return json(400, { error: 'The request body must be a JSON object.' }) }

  const action = typeof b.action === 'string' ? b.action : ''
  if (!ACTIONS.includes(action)) return json(422, { error: `The action must be one of: ${ACTIONS.join(', ')}.` })

  // which place: a database slug, or "estate" for the general Documents tab
  const place = async (required: boolean): Promise<{ ok: true; id: string | null; kind: 'db' | 'general' | 'all'; slug: string } | { ok: false; res: Response }> => {
    const db = typeof b.db === 'string' ? b.db.trim() : ''
    if (!db) return required ? { ok: false, res: json(422, { error: 'db is required: a database slug, or "estate" for the general Documents tab.' }) } : { ok: true, id: null, kind: 'all', slug: '' }
    if (db.toLowerCase() === 'estate') return { ok: true, id: null, kind: 'general', slug: 'estate' }
    const d = await store.findDatabase(db)
    return d ? { ok: true, id: d.id, kind: 'db', slug: d.slug } : { ok: false, res: json(422, { error: 'No database has that slug. Use "estate" for the general Documents tab.' }) }
  }

  if (action === 'list') {
    const p = await place(false); if (!p.ok) return p.res
    const limit = b.limit === undefined ? DEFAULT_LIMIT : b.limit
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return json(422, { error: `limit must be a whole number from 1 to ${MAX_LIMIT}.` })
    const folder = typeof b.folder === 'string' && b.folder.trim() ? b.folder.trim() : null
    const items = await store.listDocs({ database_id: p.kind === 'all' ? 'all' : p.id, folder, limit: limit + 1, history: b.history === true })
    // a listing never carries a storage path, whatever the store returns
    const clean = items.slice(0, limit).map((i) => { const { path: _p, ...rest } = i as DocMeta & { path?: string }; return rest })
    return json(200, { items: clean, truncated: items.length > limit })
  }

  if (action === 'get') {
    const ref = parseRef(b.id); if (!ref) return json(422, { error: 'id must look like d:<uuid> or g:<uuid> (use list to find it).' })
    const doc = await store.getDoc(ref); if (!doc) return json(404, { error: 'No document has that id.' })
    const { path, ...meta } = doc
    if (b.content !== true) return json(200, { document: meta })
    if ((doc.size ?? 0) > MAX_FILE_BYTES) return json(413, { error: `That file is larger than ${MAX_FILE_BYTES / 1_000_000} MB and cannot be fetched here.` })
    const bytes = await store.readFile(path); if (!bytes) return json(404, { error: 'The file for that document is missing.' })
    return json(200, { document: meta, sha256: await sha256Hex(bytes), content_base64: toBase64(bytes) })
  }

  if (action === 'update') {
    const ref = parseRef(b.id); if (!ref) return json(422, { error: 'id must look like d:<uuid> or g:<uuid>.' })
    if (b.content_base64 !== undefined) return json(422, { error: 'A file cannot be changed in place. Upload the changed file as a new version with "replaces".' })
    const d = details(b, { required: false }); if (!d.ok) return json(422, { error: d.error })
    const patch: Record<string, unknown> = {}
    for (const k of ['name', 'folder', 'tags', 'reason', 'description', 'document_date'] as const) if (d.v[k] !== undefined) patch[k] = d.v[k]
    if (!Object.keys(patch).length) return json(422, { error: 'Nothing to change. Send one or more of: name, folder, tags, reason, description, document_date.' })
    const doc = await store.getDoc(ref); if (!doc) return json(404, { error: 'No document has that id.' })
    if (ref.kind === 'db' && patch.folder !== undefined) return json(422, { error: 'Database documents have no folder. Use db "estate" for folders.' })
    await store.updateDoc(ref, patch)
    return json(200, { id: refText(ref), updated: Object.keys(patch) })
  }

  // upload
  const p = await place(true); if (!p.ok) return p.res
  const d = details(b, { required: true }); if (!d.ok) return json(422, { error: d.error })
  const filename = typeof b.filename === 'string' ? b.filename.trim() : ''
  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : ''
  const type = TYPES[ext]
  if (!type) return json(422, { error: `filename must end in one of: ${Object.keys(TYPES).join(', ')}.` })
  if (typeof b.content_base64 !== 'string' || !b.content_base64) return json(422, { error: 'content_base64 is required (the file, base64 encoded).' })
  if (b.content_base64.length > MAX_BODY_CHARS) return json(413, { error: `The file is too large. At most ${MAX_FILE_BYTES / 1_000_000} MB.` })
  const bytes = toBytes(b.content_base64)
  if (!bytes || !bytes.length) return json(422, { error: 'content_base64 is not valid base64.' })
  if (bytes.length > MAX_FILE_BYTES) return json(413, { error: `The file is too large. At most ${MAX_FILE_BYTES / 1_000_000} MB.` })
  if (!type.magic.every((x, i) => bytes[i] === x)) return json(422, { error: `The file content is not a real .${ext} file.` })
  if (p.kind === 'db' && d.v.folder) return json(422, { error: 'Database documents have no folder. Use db "estate" for folders.' })
  const name = d.v.name ?? filename.replace(/\.[^.]+$/, '')

  let replaces: DocRef | null = null
  if (b.replaces !== undefined) {
    replaces = parseRef(b.replaces); if (!replaces) return json(422, { error: 'replaces must look like d:<uuid> or g:<uuid>.' })
    if (replaces.kind !== (p.kind === 'db' ? 'db' : 'general')) return json(422, { error: 'replaces must be a document in the same place (the same database, or the general Documents tab).' })
    const old = await store.getDoc(replaces); if (!old) return json(404, { error: 'The document to replace was not found.' })
    if (!old.current) return json(409, { error: 'That document is already an older version. Replace the current one.' })
  } else {
    const clash = await store.findCurrentByName(p.kind === 'db' ? 'db' : 'general', p.id, name)
    if (clash) return json(409, { error: 'A current document with that name already exists. Send "replaces" with its id to add a new version, or use a different name.', existing: refText(clash) })
  }

  let entryId: string | null = null
  if (b.entry_id !== undefined) {
    if (p.kind !== 'db' || typeof b.entry_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(b.entry_id)) return json(422, { error: 'entry_id is a timeline entry id and only applies to database documents.' })
    entryId = b.entry_id.toLowerCase()
  }
  let date: string | null = d.v.document_date ?? null
  if (!date) date = now.toISOString().slice(0, 10)

  const folderPart = p.kind === 'general' && d.v.folder ? safeName(d.v.folder) : '_'
  const path = p.kind === 'db' ? `databases/${p.id}/${crypto.randomUUID()}-${safeName(filename)}` : `documents/${folderPart}/${crypto.randomUUID()}-${safeName(filename)}`
  await store.putFile(path, bytes, type.mime)
  const ref = await store.insertDoc({
    kind: p.kind === 'db' ? 'db' : 'general', database_id: p.id, name, folder: d.v.folder ?? '', tags: d.v.tags ?? [], reason: d.v.reason!,
    made_by: d.v.made_by || 'Claude Code', description: d.v.description ?? '', document_date: date, path, mime: type.mime, size: bytes.length,
    replaces_id: replaces?.id ?? null, entry_id: entryId,
  })
  if (replaces) await store.supersede(replaces)
  return json(201, { id: refText(ref), replaced: replaces ? refText(replaces) : null, size: bytes.length, document_date: date })
}
