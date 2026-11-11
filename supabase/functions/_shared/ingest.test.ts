import { beforeEach, describe, expect, it } from 'vitest'
import { handleIngest, type IngestStore, type NewEntry, type TokenRow } from './ingest'
import { sha256Hex } from './hash'

const TOKEN = 'fgl_test_token_value'
const NOW = new Date('2026-11-11T10:00:00Z')

let inserted: NewEntry[]
let resolved: string[]
let token: TokenRow
let store: IngestStore

beforeEach(async () => {
  inserted = []; resolved = []
  token = { id: 'tok1', revoked_at: null, window_start: null, window_count: 0, scope: 'log' }
  const hash = await sha256Hex(TOKEN)
  store = {
    findToken: async (h) => (h === hash ? token : null),
    saveRate: async (_id, start, count) => { token = { ...token, window_start: start, window_count: count } },
    findDatabaseId: async (s) => (s === 'public_hospital' ? 'db-uuid' : null),
    findEntry: async (id) =>
      id === '11111111-1111-1111-1111-111111111111' ? { id, type: 'Error', database_id: 'db-uuid' } : null,
    insertEntry: async (e) => { inserted.push(e); return 'new-id' },
    resolveEntry: async (id) => { resolved.push(id) },
  }
})

const post = (body: unknown, auth: string | null = `Bearer ${TOKEN}`, now = NOW) =>
  handleIngest(
    new Request('https://x.test/log-ingest', {
      method: 'POST', headers: auth ? { authorization: auth } : {}, body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    store, now,
  )

describe('log-ingest', () => {
  it('stores a valid entry as Claude Code and returns only the id', async () => {
    const r = await post({ db: 'public_hospital', type: 'Error', phase: 2, title: 'Load failed', summary: 'Plain words', detail: 'Msg 547' })
    expect(r.status).toBe(201)
    expect(await r.json()).toEqual({ id: 'new-id' })
    expect(inserted[0]).toMatchObject({
      database_id: 'db-uuid', type: 'Error', phase: '2', author: 'Claude Code', status: 'Open', created_via: 'ingest', token_id: 'tok1',
    })
  })
  it('allows the author to be overridden to a team member only', async () => {
    expect((await post({ title: 'x', author: 'Rajen' })).status).toBe(201)
    expect((await post({ title: 'x', author: 'Someone' })).status).toBe(422)
  })
  it('rejects a missing, wrong or revoked token', async () => {
    expect((await post({ title: 'x' }, null)).status).toBe(401)
    expect((await post({ title: 'x' }, 'Bearer nope')).status).toBe(401)
    token = { ...token, revoked_at: '2026-11-10T00:00:00Z' }
    expect((await post({ title: 'x' })).status).toBe(401)
    expect(inserted).toHaveLength(0)
  })
  it('refuses a content token', async () => {
    token = { ...token, scope: 'content' }
    expect((await post({ title: 'x' })).status).toBe(401)
    expect(inserted).toHaveLength(0)
  })
  it('only accepts POST', async () => {
    const r = await handleIngest(new Request('https://x.test', { method: 'GET' }), store, NOW)
    expect(r.status).toBe(405)
  })
  it('runs the redaction check and never echoes the value', async () => {
    const r = await post({ title: 'Mail sipho@example.com' })
    expect(r.status).toBe(422)
    const text = await r.text()
    expect(text).toContain('email address')
    expect(text).not.toContain('sipho')
    expect(inserted).toHaveLength(0)
  })
  it('validates type, status, database and parent', async () => {
    expect((await post({ title: 'x', type: 'Rant' })).status).toBe(422)
    expect((await post({ title: 'x', type: 'Note', status: 'Open' })).status).toBe(422)
    expect((await post({ title: 'x', db: 'unknown' })).status).toBe(422)
    expect((await post({ title: 'x', parent: 'not-an-id' })).status).toBe(422)
    expect((await post({ title: 'x', parent: '22222222-2222-2222-2222-222222222222' })).status).toBe(422)
    expect((await post('not json')).status).toBe(400)
    expect((await post({})).status).toBe(422)
  })
  it('links a reply to its parent, inherits the database, and resolves the error only when asked', async () => {
    const parent = '11111111-1111-1111-1111-111111111111'
    await post({ title: 'Fixed it', type: 'Fix', parent })
    expect(inserted[0]).toMatchObject({ parent_id: parent, database_id: 'db-uuid' })
    expect(resolved).toEqual([])
    await post({ title: 'Fixed it', type: 'Fix', parent, resolve_parent: true })
    expect(resolved).toEqual([parent])
  })
  it('accepts a backdated time', async () => {
    await post({ title: 'Old event', happened_at: '2026-10-01T08:30:00Z' })
    expect(inserted[0].happened_at).toBe('2026-10-01T08:30:00.000Z')
  })
  it('rate limits to 60 a minute per token, then recovers in the next minute', async () => {
    for (let i = 0; i < 60; i++) expect((await post({ title: 'x' })).status).toBe(201)
    const r = await post({ title: 'x' })
    expect(r.status).toBe(429)
    expect(r.headers.get('retry-after')).toBe('60')
    expect((await post({ title: 'x' }, `Bearer ${TOKEN}`, new Date(NOW.getTime() + 61_000))).status).toBe(201)
  })
})
