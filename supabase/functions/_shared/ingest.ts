import { sha256Hex } from './hash.ts'
import { checkRedaction } from './redact.ts'

/**
 * Request handling for the log-ingest Edge Function, kept free of any
 * Deno or Supabase imports so it can be tested. index.ts supplies the store.
 */

export const TYPES = ['Action', 'Error', 'Response', 'Fix', 'Decision', 'Note']
export const AUTHORS = ['Rajen', 'Huzayfa', 'Claude Code']
export const RATE_LIMIT_PER_MINUTE = 60

export type TokenRow = {
  id: string; revoked_at: string | null; window_start: string | null; window_count: number
}
export type NewEntry = {
  database_id: string | null; happened_at: string; type: string; phase: string; author: string
  title: string; summary: string; detail: string; status: 'Open' | 'Resolved' | null
  parent_id: string | null; session_label: string; created_via: 'ingest'; token_id: string
}
export interface IngestStore {
  findToken(hash: string): Promise<TokenRow | null>
  saveRate(tokenId: string, windowStart: string, count: number, usedAt: string): Promise<void>
  findDatabaseId(slug: string): Promise<string | null>
  findEntry(id: string): Promise<{ id: string; type: string; database_id: string | null } | null>
  insertEntry(e: NewEntry): Promise<string>
  resolveEntry(id: string): Promise<void>
}

const json = (status: number, body: Record<string, unknown>, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...extra } })

const str = (v: unknown, max: number): string | null =>
  v === undefined || v === null ? '' : typeof v === 'string' && v.length <= max ? v : null

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function handleIngest(req: Request, store: IngestStore, now: Date = new Date()): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' }, { allow: 'POST' })

  // ---- token ----
  const m = (req.headers.get('authorization') ?? '').match(/^Bearer\s+(\S+)$/i)
  if (!m) return json(401, { error: 'Missing log token.' })
  const token = await store.findToken(await sha256Hex(m[1]))
  if (!token || token.revoked_at) return json(401, { error: 'This log token is not valid.' })

  // ---- rate limit: 60 requests per token per minute (rejected ones count too) ----
  const start = token.window_start ? new Date(token.window_start) : null
  const fresh = !start || now.getTime() - start.getTime() >= 60_000
  const count = fresh ? 1 : token.window_count + 1
  await store.saveRate(token.id, fresh ? now.toISOString() : token.window_start!, count, now.toISOString())
  if (count > RATE_LIMIT_PER_MINUTE) return json(429, { error: 'Too many log entries. Wait a minute and try again.' }, { 'retry-after': '60' })

  // ---- body ----
  let b: Record<string, unknown>
  try {
    const raw = await req.json()
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error()
    b = raw as Record<string, unknown>
  } catch {
    return json(400, { error: 'The request body must be a JSON object.' })
  }

  const title = typeof b.title === 'string' ? b.title.trim() : ''
  if (!title || title.length > 200) return json(422, { error: 'A title of 1 to 200 characters is required.' })
  const summary = str(b.summary, 5000)
  const detail = str(b.detail, 100000)
  const session = str(b.session_label, 120)
  if (summary === null) return json(422, { error: 'The summary must be text of at most 5000 characters.' })
  if (detail === null) return json(422, { error: 'The detail must be text of at most 100000 characters.' })
  if (session === null) return json(422, { error: 'The session label must be text of at most 120 characters.' })

  const type = typeof b.type === 'string' ? b.type : 'Note'
  if (!TYPES.includes(type)) return json(422, { error: `The type must be one of: ${TYPES.join(', ')}.` })
  const author = typeof b.author === 'string' && b.author ? b.author : 'Claude Code'
  if (!AUTHORS.includes(author)) return json(422, { error: `The author must be one of: ${AUTHORS.join(', ')}.` })
  const phase = b.phase === undefined || b.phase === null || b.phase === '' ? '1' : String(b.phase).trim()
  if (!phase || phase.length > 40) return json(422, { error: 'The phase must be 1 to 40 characters.' })

  let status: 'Open' | 'Resolved' | null = null
  if (type === 'Error') {
    status = b.status === undefined || b.status === null || b.status === '' ? 'Open' : (b.status as 'Open' | 'Resolved')
    if (status !== 'Open' && status !== 'Resolved') return json(422, { error: 'The status must be Open or Resolved.' })
  } else if (b.status !== undefined && b.status !== null && b.status !== '') {
    return json(422, { error: 'A status only applies to Error entries.' })
  }

  let happened = now.toISOString()
  if (b.happened_at !== undefined && b.happened_at !== null && b.happened_at !== '') {
    const d = new Date(String(b.happened_at))
    if (Number.isNaN(d.getTime())) return json(422, { error: 'happened_at must be a valid date and time.' })
    happened = d.toISOString()
  }

  // ---- redaction (never echoes the matched text) ----
  const red = checkRedaction({ title, summary, detail })
  if (!red.ok) return json(422, { error: red.message, kind: red.kind, field: red.field })

  // ---- database and parent ----
  let databaseId: string | null = null
  const db = typeof b.db === 'string' ? b.db.trim() : ''
  if (db && db.toLowerCase() !== 'estate' && db.toLowerCase() !== 'whole estate') {
    databaseId = await store.findDatabaseId(db)
    if (!databaseId) return json(422, { error: 'No database has that slug. Use "estate" for the whole estate.' })
  }
  let parentId: string | null = null
  const parent = typeof b.parent === 'string' ? b.parent.trim() : ''
  let parentRow: { id: string; type: string; database_id: string | null } | null = null
  if (parent) {
    if (!UUID.test(parent)) return json(422, { error: 'The parent must be an entry id.' })
    parentRow = await store.findEntry(parent)
    if (!parentRow) return json(422, { error: 'No entry has that parent id.' })
    parentId = parentRow.id
    if (!db && parentRow.database_id) databaseId = parentRow.database_id   // a reply defaults to its parent's database
  }

  const id = await store.insertEntry({
    database_id: databaseId, happened_at: happened, type, phase, author, title, summary: summary!, detail: detail!,
    status, parent_id: parentId, session_label: session!, created_via: 'ingest', token_id: token.id,
  })
  // a Fix can close the error it answers, only when the sender asks for it
  if (b.resolve_parent === true && type === 'Fix' && parentRow?.type === 'Error') await store.resolveEntry(parentRow.id)

  return json(201, { id })
}
