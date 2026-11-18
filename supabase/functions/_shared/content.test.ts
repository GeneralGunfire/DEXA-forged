import { beforeEach, describe, expect, it } from 'vitest'
import { handleContent, type ContentStore, type Section } from './content'
import { sha256Hex } from './hash'

const TOKEN = 'fgc_test_token_value'
const NOW = new Date('2026-11-12T10:00:00Z')
let saved: Section[]
let token: { id: string; revoked_at: string | null; window_start: string | null; window_count: number; scope: string }
let store: ContentStore
let fields: Record<string, string>
let writes: [string, string][]

beforeEach(async () => {
  saved = []
  writes = []
  fields = { background: 'In real life. About 8.9 million beneficiaries (annual report). In the simulation. 10 schemes.', shortfalls: '- Billing is 45% unbilled by design.\n- Other point.', build_record: 'Port 5433.' }
  token = { id: 'tok1', revoked_at: null, window_start: null, window_count: 0, scope: 'content' }
  const hash = await sha256Hex(TOKEN)
  store = {
    findToken: async (h) => (h === hash ? token : null),
    saveRate: async (_i, start, count) => { token = { ...token, window_start: start, window_count: count } },
    findDatabaseId: async (s) => (s === 'public_hospital' ? 'db-uuid' : null),
    upsertSection: async (s) => { const created = !saved.some((x) => x.title === s.title); saved.push(s); return { id: 'sec-id', created } },
    getField: async (_db, f) => (f in fields ? fields[f] : null),
    setField: async (_db, f, t) => { writes.push([f, t]); fields[f] = t },
  }
})
const post = (body: unknown, auth: string | null = `Bearer ${TOKEN}`, now = NOW) =>
  handleContent(new Request('https://x.test/content-write', { method: 'POST', headers: auth ? { authorization: auth } : {}, body: JSON.stringify(body) }), store, now)

const ok = { db: 'public_hospital', area: 'build', title: 'Tables', body: 'There are 108 tables.' }

describe('content-write', () => {
  it('saves a section for a database and reports created, then updated', async () => {
    const r = await post({ ...ok, summary: 'Plain words', position: 10 })
    expect(r.status).toBe(201)
    expect(await r.json()).toEqual({ id: 'sec-id', created: true })
    expect(saved[0]).toMatchObject({ database_id: 'db-uuid', area: 'build', title: 'Tables', position: 10, collapsed: true, kind: 'text' })
    expect((await post(ok)).status).toBe(200)
  })
  it('saves a whole-estate section with no database', async () => {
    expect((await post({ area: 'estate', title: 'Port registry', body: 'Ports and instances.' })).status).toBe(201)
    expect(saved[0].database_id).toBeNull()
    expect((await post({ area: 'estate', db: 'public_hospital', title: 'x', body: 'x' })).status).toBe(422)
  })
  it('refuses a log token, a missing token and a revoked token', async () => {
    token = { ...token, scope: 'log' }
    expect((await post(ok)).status).toBe(401)
    token = { ...token, scope: 'content', revoked_at: '2026-11-11T00:00:00Z' }
    expect((await post(ok)).status).toBe(401)
    expect((await post(ok, null)).status).toBe(401)
    expect(saved).toHaveLength(0)
  })
  it('validates area, kind, database, position and body', async () => {
    expect((await post({ ...ok, area: 'other' })).status).toBe(422)
    expect((await post({ ...ok, kind: 'video' })).status).toBe(422)
    expect((await post({ ...ok, db: 'nope' })).status).toBe(422)
    expect((await post({ ...ok, db: undefined })).status).toBe(422)
    expect((await post({ ...ok, position: 1.5 })).status).toBe(422)
    expect((await post({ ...ok, body: '  ' })).status).toBe(422)
    expect((await post({ ...ok, body: 'x'.repeat(400_001) })).status).toBe(422)
  })
  it('checks tables: shape, column count and cell text', async () => {
    const good = JSON.stringify({ columns: ['Table', 'Rows'], rows: [['patient', '6716'], ['encounter', '75783']] })
    expect((await post({ ...ok, kind: 'table', body: good })).status).toBe(201)
    expect((await post({ ...ok, kind: 'table', body: 'not json' })).status).toBe(422)
    expect((await post({ ...ok, kind: 'table', body: JSON.stringify({ columns: ['a'], rows: [['1', '2']] }) })).status).toBe(422)
  })
  it('checks charts: type, items and numbers', async () => {
    const bar = JSON.stringify({ type: 'bar', items: [{ label: 'Tablet', value: 58 }, { label: 'Capsule', value: 7 }] })
    expect((await post({ ...ok, kind: 'chart', body: bar })).status).toBe(201)
    const ba = JSON.stringify({ type: 'before-after', unit: '%', items: [{ label: 'Private hospital', before: 0, after: 29 }] })
    expect((await post({ ...ok, title: 'Match rates', kind: 'chart', body: ba })).status).toBe(201)
    expect((await post({ ...ok, kind: 'chart', body: JSON.stringify({ type: 'pie', items: [] }) })).status).toBe(422)
    expect((await post({ ...ok, kind: 'chart', body: JSON.stringify({ type: 'bar', items: [{ label: 'x', value: 'many' }] }) })).status).toBe(422)
    expect((await post({ ...ok, kind: 'chart', body: JSON.stringify({ type: 'bar', items: [{ label: 'mail a@b.co', value: 1 }] }) })).status).toBe(422)
  })
  it('runs the redaction check on body, title and table cells and never echoes the value', async () => {
    const r = await post({ ...ok, body: 'Contact sipho@example.com for access' })
    expect(r.status).toBe(422)
    const text = await r.text()
    expect(text).toContain('email address')
    expect(text).not.toContain('sipho')
    const t = JSON.stringify({ columns: ['Note'], rows: [['password=hunter2']] })
    expect((await post({ ...ok, kind: 'table', body: t })).status).toBe(422)
    expect(saved).toHaveLength(0)
  })
  it('allows ordinary schema text: table names, counts and column types', async () => {
    expect((await post({ ...ok, body: 'dbo.PATMASTER (varchar(13), nullable) has 6,716 rows; 35 of 108 tables have no key. Msg 547.' })).status).toBe(201)
  })
  it('rate limits to 60 a minute', async () => {
    for (let i = 0; i < 60; i++) expect((await post(ok)).status).toBeLessThan(300)
    expect((await post(ok)).status).toBe(429)
  })
})

describe('content-write: record fields', () => {
  const edit = { db: 'public_hospital', field: 'shortfalls', replace: '45% unbilled by design', with: '45.0% have no bill account' }
  it('dry run shows old and new text and writes nothing', async () => {
    const r = await post({ ...edit, dry_run: true })
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.dry_run).toBe(true)
    expect(j.old).toContain('45% unbilled by design')
    expect(j.new).toContain('45.0% have no bill account')
    expect(j.new).toContain('- Other point.')
    expect(writes).toHaveLength(0)
    expect(fields.shortfalls).toContain('45% unbilled by design')
  })
  it('writes only the replaced sentence and reports the lengths; the old text is returned by the dry run first', async () => {
    const before = (await (await post({ ...edit, dry_run: true })).json()).old
    const r = await post(edit)
    expect(r.status).toBe(200)
    expect((await r.json())).toMatchObject({ dry_run: false, changed: true, old_length: before.length })
    expect(writes).toEqual([['shortfalls', before.replace('45% unbilled by design', '45.0% have no bill account')]])
    expect(fields.shortfalls).toBe('- Billing is 45.0% have no bill account.\n- Other point.')
  })
  it('refuses any field that is not on the allowlist, and reads nothing', async () => {
    for (const f of ['name', 'port', 'status', 'created_by', 'id', '__proto__', 'toString', '']) {
      expect((await post({ ...edit, field: f })).status).toBe(422)
    }
    expect(writes).toHaveLength(0)
  })
  it('allows each of the three free-text fields', async () => {
    expect((await post({ db: 'public_hospital', field: 'background', replace: '8.9 million beneficiaries (annual report)', with: '9.17 million beneficiaries (annual report)', dry_run: true })).status).toBe(200)
    expect((await post({ db: 'public_hospital', field: 'build_record', replace: 'Port 5433.', with: 'Port 5433 (PostgreSQL).', dry_run: true })).status).toBe(200)
  })
  it('requires the old text to appear exactly once', async () => {
    expect((await post({ ...edit, replace: 'not in the field' })).status).toBe(422)
    fields.shortfalls = 'same same'
    expect((await post({ ...edit, replace: 'same' })).status).toBe(422)
    expect(writes).toHaveLength(0)
  })
  it('validates the request and needs a content token', async () => {
    expect((await post({ ...edit, db: 'nope' })).status).toBe(422)
    expect((await post({ ...edit, db: undefined })).status).toBe(422)
    expect((await post({ ...edit, replace: '  ' })).status).toBe(422)
    expect((await post({ ...edit, with: 5 })).status).toBe(422)
    expect((await post({ ...edit, dry_run: 'yes' })).status).toBe(422)
    expect((await post(edit, null)).status).toBe(401)
    token = { ...token, scope: 'log' }
    expect((await post(edit)).status).toBe(401)
    expect(writes).toHaveLength(0)
  })
  it('runs the redaction check on the new text and never echoes it', async () => {
    const r = await post({ ...edit, with: 'Contact 0821234567 now' })
    expect(r.status).toBe(422)
    expect(JSON.stringify(await r.json())).not.toContain('0821234567')
    expect(writes).toHaveLength(0)
  })
  it('refuses a field that would grow past its limit', async () => {
    fields.shortfalls = 'x'.repeat(19_990) + ' tail'
    expect((await post({ ...edit, replace: 'tail', with: 'y'.repeat(100) })).status).toBe(422)
    expect(writes).toHaveLength(0)
  })
})
