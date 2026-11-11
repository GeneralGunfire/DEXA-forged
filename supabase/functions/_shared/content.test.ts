import { beforeEach, describe, expect, it } from 'vitest'
import { handleContent, type ContentStore, type Section } from './content'
import { sha256Hex } from './hash'

const TOKEN = 'fgc_test_token_value'
const NOW = new Date('2026-11-12T10:00:00Z')
let saved: Section[]
let token: { id: string; revoked_at: string | null; window_start: string | null; window_count: number; scope: string }
let store: ContentStore

beforeEach(async () => {
  saved = []
  token = { id: 'tok1', revoked_at: null, window_start: null, window_count: 0, scope: 'content' }
  const hash = await sha256Hex(TOKEN)
  store = {
    findToken: async (h) => (h === hash ? token : null),
    saveRate: async (_i, start, count) => { token = { ...token, window_start: start, window_count: count } },
    findDatabaseId: async (s) => (s === 'public_hospital' ? 'db-uuid' : null),
    upsertSection: async (s) => { const created = !saved.some((x) => x.title === s.title); saved.push(s); return { id: 'sec-id', created } },
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
