import { beforeEach, describe, expect, it } from 'vitest'
import { handleDocs, MAX_FILE_BYTES, type DocMeta, type DocRef, type DocsStore, type NewDoc } from './docs'
import { handleRead, type ReadStore } from './read'
import { handleIngest, type IngestStore } from './ingest'
import { handleContent, type ContentStore } from './content'
import { sha256Hex } from './hash'

const TOKEN = 'fgd_test_token_value'
const NOW = new Date('2026-11-17T10:00:00Z')
const DB = { id: '11111111-1111-1111-1111-111111111111', slug: 'private_hospital' }
type Tok = { id: string; revoked_at: string | null; window_start: string | null; window_count: number; scope: string }
type Stored = DocMeta & { path: string; kind: 'db' | 'general'; bytes?: Uint8Array }

let token: Tok
let store: DocsStore
let docs: Stored[]
let files: Map<string, Uint8Array>
let n: number

const uuid = () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}`
const b64 = (bytes: number[] | Uint8Array) => { const u = Uint8Array.from(bytes); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s) }
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3]
const ok = { action: 'upload', db: 'estate', filename: 'report.pdf', content_base64: b64(PDF), reason: 'First copy of the official report.' }

beforeEach(async () => {
  n = 0; docs = []; files = new Map()
  token = { id: 'tok1', revoked_at: null, window_start: null, window_count: 0, scope: 'docs' }
  const hash = await sha256Hex(TOKEN)
  const find = (ref: DocRef) => docs.find((d) => d.ref === `${ref.kind === 'db' ? 'd' : 'g'}:${ref.id}`)
  store = {
    findToken: async (h) => (h === hash ? token : null),
    saveRate: async (_i, start, count) => { token = { ...token, window_start: start, window_count: count } },
    findDatabase: async (s) => (s === DB.slug ? DB : null),
    listDocs: async ({ database_id, folder, limit, history }) =>
      docs.filter((d) => (history || d.current) && (database_id === 'all' || (database_id === null ? d.kind === 'general' : d.kind === 'db')) && (!folder || d.folder === folder)).slice(0, limit),
    getDoc: async (ref) => find(ref) ?? null,
    findCurrentByName: async (kind, _db, name) => { const d = docs.find((x) => x.kind === kind && x.name === name && x.current); return d ? { kind, id: d.ref.slice(2) } : null },
    putFile: async (path, bytes) => { if (files.has(path)) throw new Error('exists'); files.set(path, bytes) },
    readFile: async (path) => files.get(path) ?? null,
    insertDoc: async (d: NewDoc) => {
      const id = uuid()
      docs.push({ ref: `${d.kind === 'db' ? 'd' : 'g'}:${id}`, kind: d.kind, db: d.kind === 'db' ? DB.slug : 'estate', name: d.name, folder: d.folder, tags: d.tags, reason: d.reason, made_by: d.made_by,
        description: d.description, document_date: d.document_date, created_at: NOW.toISOString(), size: d.size, mime: d.mime, current: true, replaces: d.replaces_id ? `${d.kind === 'db' ? 'd' : 'g'}:${d.replaces_id}` : null, path: d.path })
      return { kind: d.kind, id }
    },
    supersede: async (ref) => { const d = find(ref); if (d) d.current = false },
    updateDoc: async (ref, patch) => { const d = find(ref); if (d) Object.assign(d, patch) },
  }
})

const call = (body: unknown, auth: string | null = `Bearer ${TOKEN}`, now = NOW) =>
  handleDocs(new Request('https://x.test/forge-docs', { method: 'POST', headers: auth ? { authorization: auth } : {}, body: JSON.stringify(body) }), store, now)
const body = async (r: Response) => await r.json()

describe('forge-docs: tokens', () => {
  it('refuses a missing, wrong, revoked, log, content or read token', async () => {
    expect((await call({ action: 'list' }, null)).status).toBe(401)
    expect((await call({ action: 'list' }, 'Bearer wrong_token')).status).toBe(401)
    token = { ...token, revoked_at: '2026-11-16T00:00:00Z' }
    expect((await call({ action: 'list' })).status).toBe(401)
    for (const scope of ['log', 'content', 'read']) { token = { ...token, revoked_at: null, scope }; expect((await call({ action: 'list' })).status).toBe(401) }
    expect(docs).toHaveLength(0)
  })
  it('a docs token is refused by forge-read, log-ingest and content-write', async () => {
    const hash = await sha256Hex(TOKEN)
    const headers = { authorization: `Bearer ${TOKEN}` }
    let wrote = 0
    const read = { findToken: async (h: string) => (h === hash ? token : null), saveRate: async () => {} } as unknown as ReadStore
    const ingest: IngestStore = { findToken: async (h) => (h === hash ? token : null), saveRate: async () => {}, findDatabaseId: async () => 'd', findEntry: async () => null, insertEntry: async () => { wrote++; return 'id' }, resolveEntry: async () => { wrote++ } }
    const content: ContentStore = { findToken: async (h) => (h === hash ? token : null), saveRate: async () => {}, findDatabaseId: async () => 'd', upsertSection: async () => { wrote++; return { id: 'x', created: true } } }
    expect((await handleRead(new Request('https://x.test/r', { method: 'POST', headers, body: '{}' }), read, NOW)).status).toBe(401)
    expect((await handleIngest(new Request('https://x.test/l', { method: 'POST', headers, body: JSON.stringify({ title: 'x' }) }), ingest, NOW)).status).toBe(401)
    expect((await handleContent(new Request('https://x.test/c', { method: 'POST', headers, body: JSON.stringify({ area: 'estate', title: 'x', body: 'y' }) }), content, NOW)).status).toBe(401)
    expect(wrote).toBe(0)
  })
  it('limits each token to 60 requests a minute, then starts a new minute', async () => {
    for (let i = 0; i < 60; i++) expect((await call({ action: 'list' })).status).toBe(200)
    const r = await call({ action: 'list' })
    expect(r.status).toBe(429)
    expect(r.headers.get('retry-after')).toBe('60')
    expect((await call({ action: 'list' }, undefined, new Date('2026-11-17T10:01:01Z'))).status).toBe(200)
  })
  it('has no delete action and only accepts POST and known actions', async () => {
    expect((await call({ action: 'delete', id: 'g:x' })).status).toBe(422)
    expect((await handleDocs(new Request('https://x.test/d', { method: 'GET', headers: { authorization: `Bearer ${TOKEN}` } }), store, NOW)).status).toBe(405)
    expect(Object.keys(store)).not.toContain('deleteDoc')
  })
})

describe('forge-docs: upload', () => {
  it('adds a document to a folder with tags and a reason, and stores the file', async () => {
    const r = await call({ ...ok, folder: 'Originals 10 Nov 2026', tags: ['Original', 'final'], description: 'As supplied.' })
    expect(r.status).toBe(201)
    const d = docs[0]
    expect(d).toMatchObject({ name: 'report', folder: 'Originals 10 Nov 2026', tags: ['original', 'final'], reason: 'First copy of the official report.', made_by: 'Claude Code', current: true, size: PDF.length, mime: 'application/pdf' })
    expect(d.path).toMatch(/^documents\/originals-10-nov-2026\/.+-report\.pdf$/)
    expect(files.get(d.path)).toEqual(new Uint8Array(PDF))
    expect((await body(r)).document_date).toBe('2026-11-17')
  })
  it('adds a document to a database', async () => {
    const r = await call({ ...ok, db: 'private_hospital', document_date: '2026-11-10' })
    expect(r.status).toBe(201)
    expect(docs[0]).toMatchObject({ kind: 'db', db: 'private_hospital', document_date: '2026-11-10' })
    expect(docs[0].path).toContain(`databases/${DB.id}/`)
    expect((await call({ ...ok, db: 'nope' })).status).toBe(422)
    expect((await call({ ...ok, db: undefined })).status).toBe(422)
  })
  it('needs a reason and refuses unsafe or invalid files', async () => {
    expect((await call({ ...ok, reason: '' })).status).toBe(422)
    expect((await call({ ...ok, filename: 'x.exe' })).status).toBe(422)
    expect((await call({ ...ok, filename: 'x.docx' })).status).toBe(422)            // a PDF is not a docx
    expect((await call({ ...ok, content_base64: b64([1, 2, 3, 4, 5, 6]) })).status).toBe(422)
    expect((await call({ ...ok, content_base64: '***not base64***' })).status).toBe(422)
    expect((await call({ ...ok, content_base64: '' })).status).toBe(422)
    expect((await call({ ...ok, tags: ['ok', '<script>'] })).status).toBe(422)
    expect((await call({ ...ok, document_date: '12/11/2026' })).status).toBe(422)
    expect(docs).toHaveLength(0)
  })
  it('refuses a file over the size limit', async () => {
    const big = new Uint8Array(MAX_FILE_BYTES + 10); big.set(PDF)
    expect((await call({ ...ok, content_base64: b64(big) })).status).toBe(413)
    expect(docs).toHaveLength(0)
  })
  it('runs the redaction check on every text field and never echoes the match', async () => {
    for (const k of ['reason', 'description', 'name', 'folder']) {
      const r = await call({ ...ok, [k]: 'write to someone@example.org' })
      expect(r.status).toBe(422)
      expect(JSON.stringify(await body(r))).not.toContain('example.org')
    }
    expect((await call({ ...ok, tags: ['someone@example.org'] })).status).toBe(422)
    expect(docs).toHaveLength(0)
  })
  it('refuses a clash with a current document unless it replaces it', async () => {
    await call(ok)
    const r = await call(ok)
    expect(r.status).toBe(409)
    expect((await body(r)).existing).toBe(docs[0].ref)
  })
})

describe('forge-docs: versions and details', () => {
  it('a new version replaces the current one and keeps the old one as history', async () => {
    await call(ok)
    const old = docs[0].ref
    const v2 = [...PDF, 0x76, 0x32]
    const r = await call({ ...ok, content_base64: b64(v2), replaces: old, reason: 'Corrected the figures after the fix.', tags: ['update'] })
    expect(r.status).toBe(201)
    expect((await body(r)).replaced).toBe(old)
    expect(docs[0].current).toBe(false)
    expect(docs[1]).toMatchObject({ current: true, replaces: old, reason: 'Corrected the figures after the fix.' })
    expect(docs).toHaveLength(2)
    expect(files.size).toBe(2) // the old file is still there
    expect((await body(await call({ action: 'list', db: 'estate' }))).items).toHaveLength(1)
    expect((await body(await call({ action: 'list', db: 'estate', history: true }))).items).toHaveLength(2)
  })
  it('refuses to replace an older version, another place, or a missing document', async () => {
    await call(ok)
    const old = docs[0].ref
    await call({ ...ok, content_base64: b64([...PDF, 1]), replaces: old, reason: 'v2' })
    expect((await call({ ...ok, replaces: old, reason: 'again' })).status).toBe(409)
    expect((await call({ ...ok, db: 'private_hospital', replaces: docs[1].ref })).status).toBe(422)
    expect((await call({ ...ok, replaces: 'g:00000000-0000-0000-0000-999999999999' })).status).toBe(404)
    expect((await call({ ...ok, replaces: 'not-an-id' })).status).toBe(422)
  })
  it('folders apply to the general tab only', async () => {
    expect((await call({ ...ok, db: 'private_hospital', folder: 'x' })).status).toBe(422)
  })
  it('updates the details but never the file', async () => {
    await call(ok)
    const id = docs[0].ref
    expect((await call({ action: 'update', id, folder: 'Moved', tags: ['a'], reason: 'Filed properly.', name: 'Report v1' })).status).toBe(200)
    expect(docs[0]).toMatchObject({ folder: 'Moved', tags: ['a'], reason: 'Filed properly.', name: 'Report v1' })
    expect((await call({ action: 'update', id, content_base64: b64(PDF) })).status).toBe(422)
    expect((await call({ action: 'update', id })).status).toBe(422)
    expect((await call({ action: 'update', id, reason: 'mail me at someone@example.org' })).status).toBe(422)
    expect((await call({ action: 'update', id: 'g:00000000-0000-0000-0000-999999999999', name: 'x' })).status).toBe(404)
  })
})

describe('forge-docs: list and get', () => {
  beforeEach(async () => {
    await call({ ...ok, folder: 'A' })
    await call({ ...ok, filename: 'two.pdf', folder: 'B' })
    await call({ ...ok, db: 'private_hospital', filename: 'three.pdf' })
  })
  it('lists a place, a folder, or everything, with a limit and a truncation flag', async () => {
    expect((await body(await call({ action: 'list', db: 'estate' }))).items).toHaveLength(2)
    expect((await body(await call({ action: 'list', db: 'estate', folder: 'B' }))).items).toHaveLength(1)
    expect((await body(await call({ action: 'list', db: 'private_hospital' }))).items).toHaveLength(1)
    const all = await body(await call({ action: 'list', limit: 2 }))
    expect(all.items).toHaveLength(2)
    expect(all.truncated).toBe(true)
    expect((await call({ action: 'list', limit: 0 })).status).toBe(422)
    expect((await call({ action: 'list', limit: 999 })).status).toBe(422)
  })
  it('never returns a storage path in a listing or a get', async () => {
    const list = JSON.stringify(await body(await call({ action: 'list' })))
    expect(list).not.toContain('documents/')
    expect(list).not.toContain('databases/')
    const got = JSON.stringify(await body(await call({ action: 'get', id: docs[0].ref })))
    expect(got).not.toContain('documents/')
  })
  it('fetches a file with its checksum, only when asked', async () => {
    const meta = await body(await call({ action: 'get', id: docs[0].ref }))
    expect(meta.content_base64).toBeUndefined()
    const full = await body(await call({ action: 'get', id: docs[0].ref, content: true }))
    expect(atob(full.content_base64)).toBe(String.fromCharCode(...PDF))
    expect(full.sha256).toBe(await sha256Hex(new Uint8Array(PDF)))
    expect((await call({ action: 'get', id: 'g:00000000-0000-0000-0000-999999999999' })).status).toBe(404)
    expect((await call({ action: 'get', id: 'bad' })).status).toBe(422)
  })
})
