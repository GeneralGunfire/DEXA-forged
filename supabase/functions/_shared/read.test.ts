import { beforeEach, describe, expect, it } from 'vitest'
import { handleRead, MAX_RESPONSE_CHARS, MAX_SECTION_CHARS, type EntryRow, type ReadStore, type SectionRow } from './read'
import { handleIngest, type IngestStore } from './ingest'
import { handleContent, type ContentStore } from './content'
import { sha256Hex } from './hash'

const TOKEN = 'fgr_test_token_value'
const NOW = new Date('2026-11-14T10:00:00Z')
type Tok = { id: string; revoked_at: string | null; window_start: string | null; window_count: number; scope: string }
let token: Tok
let store: ReadStore
let sections: SectionRow[]
let entries: EntryRow[]
let calls: string[]

const DB = {
  id: 'db-uuid', slug: 'public_hospital', name: 'Public Hospital', machine: "Rajen's PC", db_type: 'SQL Server', status: 'Phase 1 complete',
  port: '1438', instance_name: 'PUBHOSPITAL', background: 'A public hospital system.', shortfalls: 'No real-time bed data.', build_record: 'Built from scripts.',
}
const entry = (o: Partial<EntryRow>): EntryRow => ({
  id: 'e1', parent_id: null, happened_at: '2026-11-10T09:00:00Z', type: 'Note', phase: '1', author: 'Claude Code',
  title: 'A note', summary: 'Plain words', detail: '', status: null, session_label: '', ...o,
})
const section = (o: Partial<SectionRow>): SectionRow => ({
  area: 'build', position: 10, title: 'Tables', summary: 'Every table', kind: 'text', body: 'There are 108 tables.', updated_at: '2026-11-11T10:00:00Z', ...o,
})

beforeEach(async () => {
  sections = []; entries = []; calls = []
  token = { id: 'tok1', revoked_at: null, window_start: null, window_count: 0, scope: 'read' }
  const hash = await sha256Hex(TOKEN)
  store = {
    findToken: async (h) => (h === hash ? token : null),
    saveRate: async (_i, start, count) => { token = { ...token, window_start: start, window_count: count } },
    findDatabase: async (s) => { calls.push('findDatabase'); return s === DB.slug ? DB : null },
    listDatabases: async () => { calls.push('listDatabases'); return [DB] },
    listSections: async (_d, area, limit) => { calls.push('listSections'); return sections.filter((s) => !area || s.area === area).slice(0, limit) },
    listEntries: async (_d, _s, limit) => { calls.push('listEntries'); return entries.slice(0, limit) },
    listDocuments: async () => { calls.push('listDocuments'); return [{ name: 'Final report.pdf', document_date: '2026-11-10', size: 4096, is_current: true, path: 'databases/x/secret-file.pdf' } as never] },
  }
})

const post = (body: unknown, auth: string | null = `Bearer ${TOKEN}`, now = NOW) =>
  handleRead(new Request('https://x.test/forge-read', { method: 'POST', headers: auth ? { authorization: auth } : {}, body: JSON.stringify(body) }), store, now)
const text = async (r: Response) => (await r.json()).text as string

describe('forge-read: tokens', () => {
  it('refuses a missing, wrong, revoked, log or content token', async () => {
    expect((await post({}, null)).status).toBe(401)
    expect((await post({}, 'Bearer wrong_token')).status).toBe(401)
    token = { ...token, revoked_at: '2026-11-13T00:00:00Z' }
    expect((await post({})).status).toBe(401)
    token = { ...token, revoked_at: null, scope: 'log' }
    expect((await post({})).status).toBe(401)
    token = { ...token, scope: 'content' }
    expect((await post({})).status).toBe(401)
    expect(calls).toHaveLength(0)
  })
  it('does not accept the token in the address', async () => {
    const r = await handleRead(new Request(`https://x.test/forge-read?token=${TOKEN}`), store, NOW)
    expect(r.status).toBe(401)
  })
  it('a read token is refused by log-ingest and content-write', async () => {
    const hash = await sha256Hex(TOKEN)
    let wrote = 0
    const ingest: IngestStore = {
      findToken: async (h) => (h === hash ? token : null), saveRate: async () => {}, findDatabaseId: async () => 'd', findEntry: async () => null,
      insertEntry: async () => { wrote++; return 'id' }, resolveEntry: async () => { wrote++ },
    }
    const content: ContentStore = {
      findToken: async (h) => (h === hash ? token : null), saveRate: async () => {}, findDatabaseId: async () => 'd',
      upsertSection: async () => { wrote++; return { id: 'x', created: true } },
    }
    const headers = { authorization: `Bearer ${TOKEN}` }
    const a = await handleIngest(new Request('https://x.test/log', { method: 'POST', headers, body: JSON.stringify({ title: 'x' }) }), ingest, NOW)
    const b = await handleContent(new Request('https://x.test/content', { method: 'POST', headers, body: JSON.stringify({ area: 'estate', title: 'x', body: 'y' }) }), content, NOW)
    expect(a.status).toBe(401)
    expect(b.status).toBe(401)
    expect(wrote).toBe(0)
  })
  it('limits each token to 60 requests a minute, then starts a new minute', async () => {
    for (let i = 0; i < 60; i++) expect((await post({})).status).toBe(200)
    const r = await post({})
    expect(r.status).toBe(429)
    expect(r.headers.get('retry-after')).toBe('60')
    expect((await post({}, undefined, new Date('2026-11-14T10:01:01Z'))).status).toBe(200)
  })
})

describe('forge-read: what it returns', () => {
  it('lists every database for an overview with no db', async () => {
    const t = await text(await post({}))
    expect(t).toContain('public_hospital: Public Hospital')
    expect(t).toContain('read-only context')
  })
  it('returns the fields and sections of one record', async () => {
    sections = [section({ area: 'build' }), section({ area: 'background', title: 'Real life', body: 'Who runs it.', position: 1 })]
    const b = await text(await post({ db: 'public_hospital', what: 'build' }))
    expect(b).toContain('Port: 1438')
    expect(b).toContain('There are 108 tables.')
    expect(b).not.toContain('Who runs it.')
    const g = await text(await post({ db: 'public_hospital', what: 'background' }))
    expect(g).toContain('No real-time bed data.')
    expect(g).toContain('Who runs it.')
  })
  it('renders tables and charts as plain text', async () => {
    sections = [
      section({ kind: 'table', title: 'T', body: JSON.stringify({ columns: ['Table', 'Rows'], rows: [['patient', '6716']] }) }),
      section({ kind: 'chart', title: 'C', body: JSON.stringify({ type: 'bar', unit: '%', items: [{ label: 'Tablet', value: 58 }] }) }),
    ]
    const t = await text(await post({ db: 'public_hospital', what: 'build' }))
    expect(t).toContain('Table | Rows')
    expect(t).toContain('patient | 6716')
    expect(t).toContain('Tablet: 58%')
  })
  it('chains replies under their parent', async () => {
    entries = [
      entry({ id: 'fix', parent_id: 'err', type: 'Fix', title: 'Reordered the load', happened_at: '2026-11-10T11:00:00Z' }),
      entry({ id: 'err', type: 'Error', status: 'Resolved', title: 'Load stopped', happened_at: '2026-11-10T10:00:00Z' }),
    ]
    const t = await text(await post({ db: 'public_hospital', what: 'timeline' }))
    expect(t.indexOf('Load stopped')).toBeLessThan(t.indexOf('Reordered the load'))
    expect(t).toMatch(/\n {2}2026-11-10 11:00 Fix/)
  })
  it('reads the whole estate', async () => {
    sections = [section({ area: 'estate', title: 'Ports' })]
    expect(await text(await post({ db: 'estate', what: 'estate' }))).toContain('Ports')
    expect((await post({ what: 'estate' })).status).toBe(200)
  })
  it('lists documents by name, date and size only, never a path or link', async () => {
    const t = await text(await post({ db: 'public_hospital', what: 'documents-list' }))
    expect(t).toContain('Final report.pdf; 2026-11-10; 4096 bytes; current')
    expect(t).not.toContain('secret-file')
    expect(t).not.toContain('databases/')
  })
  it('accepts a query string on GET', async () => {
    const r = await handleRead(new Request('https://x.test/forge-read?db=public_hospital&what=overview', { headers: { authorization: `Bearer ${TOKEN}` } }), store, NOW)
    expect(r.status).toBe(200)
    expect(await text(r)).toContain('Port: 1438')
  })
  it('only ever calls the read methods of the store', async () => {
    await post({ db: 'public_hospital', what: 'overview' })
    await post({ db: 'public_hospital', what: 'timeline' })
    expect(Object.keys(store).sort()).toEqual(['findDatabase', 'findToken', 'listDatabases', 'listDocuments', 'listEntries', 'listSections', 'saveRate'])
  })
})

describe('forge-read: checks and caps', () => {
  it('validates what, db, limit and since', async () => {
    expect((await post({ what: 'tokens' })).status).toBe(422)
    expect((await post({ db: 'nope', what: 'build' })).status).toBe(422)
    expect((await post({ what: 'build' })).status).toBe(422)
    expect((await post({ limit: 0 })).status).toBe(422)
    expect((await post({ limit: 201 })).status).toBe(422)
    expect((await post({ limit: 1.5 })).status).toBe(422)
    expect((await post({ since: 'not a date' })).status).toBe(422)
    const r = await handleRead(new Request('https://x.test/forge-read', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: '[]' }), store, NOW)
    expect(r.status).toBe(400)
    expect((await handleRead(new Request('https://x.test/forge-read', { method: 'DELETE', headers: { authorization: `Bearer ${TOKEN}` } }), store, NOW)).status).toBe(405)
  })
  it('says when the timeline holds more than the limit', async () => {
    entries = [entry({ id: 'a', title: 'First' }), entry({ id: 'b', title: 'Second' }), entry({ id: 'c', title: 'Third' })]
    const r = await (await post({ db: 'estate', what: 'timeline', limit: 2 })).json()
    expect(r.truncated).toBe(true)
    expect(r.text).toContain('Truncated')
    expect(r.text).toContain('First')
    expect(r.text).not.toContain('Third')
  })
  it('cuts a very long section and caps the whole answer', async () => {
    sections = Array.from({ length: 10 }, (_, i) => section({ position: i, title: `Big ${i}`, body: 'x '.repeat(MAX_SECTION_CHARS) }))
    const r = await (await post({ db: 'public_hospital', what: 'build', limit: 60 })).json()
    expect(r.truncated).toBe(true)
    expect(r.text).toContain('was cut at')
    expect(r.text.length).toBeLessThanOrEqual(MAX_RESPONSE_CHARS + 600)
  })
})

describe('forge-read: redaction safety net', () => {
  it('withholds an item that matches, says so, and never echoes the match', async () => {
    entries = [entry({ id: 'ok', title: 'Fine entry' }), entry({ id: 'bad', title: 'Contact', detail: 'write to someone@example.org' })]
    const r = await (await post({ db: 'estate', what: 'timeline' })).json()
    expect(r.withheld).toBe(1)
    expect(r.text).toContain('Fine entry')
    expect(r.text).toContain('withheld by the safety check')
    expect(r.text).not.toContain('someone@example.org')
    expect(r.text).not.toContain('example.org')
  })
  it('withholds a section and a database field that match', async () => {
    sections = [section({ title: 'Leaky', body: 'server=db01;database=x;uid=sa;' })]
    DB.shortfalls = `The old note said ${'pass' + 'word'}=hunter2 here`
    const r = await (await post({ db: 'public_hospital', what: 'build' })).json()
    const g = await (await post({ db: 'public_hospital', what: 'background' })).json()
    DB.shortfalls = 'No real-time bed data.'
    expect(r.withheld).toBe(1)
    expect(r.text).not.toContain('uid=sa')
    expect(g.withheld).toBe(1)
    expect(g.text).not.toContain('hunter2')
  })
})
