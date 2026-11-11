import { sha256Hex } from './hash.ts'
import { checkRedaction } from './redact.ts'
import type { TokenRow } from './ingest.ts'

/**
 * Request handling for the content-write Edge Function. Kept free of Deno and Supabase imports so it can be tested.
 * A content token can write sections of Background and Build record content, and nothing else.
 */

export const AREAS = ['background', 'build', 'estate']
export const KINDS = ['text', 'table', 'queries', 'sources', 'chart']
export const RATE_LIMIT_PER_MINUTE = 60
export const MAX_BODY = 400_000
const MAX_TABLE_ROWS = 3000
const MAX_TABLE_COLS = 12
const MAX_CELL = 600

export type Section = {
  database_id: string | null; area: string; position: number; title: string; summary: string
  kind: string; body: string; collapsed: boolean; token_id: string
}
export interface ContentStore {
  findToken(hash: string): Promise<(TokenRow & { scope: string }) | null>
  saveRate(tokenId: string, windowStart: string, count: number, usedAt: string): Promise<void>
  findDatabaseId(slug: string): Promise<string | null>
  upsertSection(s: Section): Promise<{ id: string; created: boolean }>
}

const json = (status: number, body: Record<string, unknown>, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...extra } })

/** A table body is JSON: {"columns": ["a","b"], "rows": [["1","2"]]}. Returns the cells as text for the redaction check. */
function checkTable(body: string): { ok: true; flat: string } | { ok: false; error: string } {
  let t: unknown
  try { t = JSON.parse(body) } catch { return { ok: false, error: 'A table body must be JSON with "columns" and "rows".' } }
  const o = t as { columns?: unknown; rows?: unknown }
  if (!o || !Array.isArray(o.columns) || !Array.isArray(o.rows)) return { ok: false, error: 'A table body must be JSON with "columns" and "rows".' }
  if (o.columns.length < 1 || o.columns.length > MAX_TABLE_COLS || !o.columns.every((c) => typeof c === 'string')) {
    return { ok: false, error: `A table needs 1 to ${MAX_TABLE_COLS} text columns.` }
  }
  if (o.rows.length > MAX_TABLE_ROWS) return { ok: false, error: `A table can have at most ${MAX_TABLE_ROWS} rows.` }
  for (const r of o.rows) {
    if (!Array.isArray(r) || r.length !== o.columns.length || !r.every((c) => typeof c === 'string' && c.length <= MAX_CELL)) {
      return { ok: false, error: `Every row must have one text cell (up to ${MAX_CELL} characters) per column.` }
    }
  }
  return { ok: true, flat: [...(o.columns as string[]), ...(o.rows as string[][]).flat()].join('\n') }
}

/** A chart body is JSON: {"type":"bar"|"stacked"|"before-after","unit":"%","items":[{"label","value"} or {"label","before","after"}]}. */
function checkChart(body: string): { ok: true; flat: string } | { ok: false; error: string } {
  const bad = { ok: false as const, error: 'A chart body must be JSON with a "type" (bar, stacked or before-after) and a list of "items".' }
  let t: unknown
  try { t = JSON.parse(body) } catch { return bad }
  const o = t as { type?: unknown; unit?: unknown; items?: unknown }
  if (!o || !['bar', 'stacked', 'before-after'].includes(String(o.type)) || !Array.isArray(o.items)) return bad
  if (o.items.length < 1 || o.items.length > 40) return { ok: false, error: 'A chart needs 1 to 40 items.' }
  if (o.unit !== undefined && (typeof o.unit !== 'string' || o.unit.length > 8)) return { ok: false, error: 'The chart unit must be short text.' }
  const labels: string[] = []
  for (const i of o.items as Record<string, unknown>[]) {
    const need = o.type === 'before-after' ? ['before', 'after'] : ['value']
    if (!i || typeof i.label !== 'string' || !i.label || i.label.length > MAX_CELL || !need.every((k) => typeof i[k] === 'number' && Number.isFinite(i[k] as number))) {
      return { ok: false, error: o.type === 'before-after' ? 'Every item needs a label and numeric before and after values.' : 'Every item needs a label and a numeric value.' }
    }
    labels.push(i.label)
  }
  return { ok: true, flat: labels.join(String.fromCharCode(10)) }
}

export async function handleContent(req: Request, store: ContentStore, now: Date = new Date()): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' }, { allow: 'POST' })

  const m = (req.headers.get('authorization') ?? '').match(/^Bearer\s+(\S+)$/i)
  if (!m) return json(401, { error: 'Missing content token.' })
  const token = await store.findToken(await sha256Hex(m[1]))
  if (!token || token.revoked_at || token.scope !== 'content') return json(401, { error: 'This content token is not valid.' })

  const start = token.window_start ? new Date(token.window_start) : null
  const fresh = !start || now.getTime() - start.getTime() >= 60_000
  const count = fresh ? 1 : token.window_count + 1
  await store.saveRate(token.id, fresh ? now.toISOString() : token.window_start!, count, now.toISOString())
  if (count > RATE_LIMIT_PER_MINUTE) return json(429, { error: 'Too many requests. Wait a minute and try again.' }, { 'retry-after': '60' })

  let b: Record<string, unknown>
  try {
    const raw = await req.json()
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error()
    b = raw as Record<string, unknown>
  } catch { return json(400, { error: 'The request body must be a JSON object.' }) }

  const area = typeof b.area === 'string' ? b.area : ''
  if (!AREAS.includes(area)) return json(422, { error: `The area must be one of: ${AREAS.join(', ')}.` })
  const title = typeof b.title === 'string' ? b.title.trim() : ''
  if (!title || title.length > 200) return json(422, { error: 'A title of 1 to 200 characters is required.' })
  const summary = b.summary === undefined || b.summary === null ? '' : b.summary
  if (typeof summary !== 'string' || summary.length > 2000) return json(422, { error: 'The summary must be text of at most 2000 characters.' })
  const kind = typeof b.kind === 'string' ? b.kind : 'text'
  if (!KINDS.includes(kind)) return json(422, { error: `The kind must be one of: ${KINDS.join(', ')}.` })
  const body = typeof b.body === 'string' ? b.body : ''
  if (!body.trim()) return json(422, { error: 'A body is required.' })
  if (body.length > MAX_BODY) return json(422, { error: `The body can be at most ${MAX_BODY} characters.` })
  const position = b.position === undefined ? 100 : b.position
  if (typeof position !== 'number' || !Number.isInteger(position) || position < 0 || position > 100000) return json(422, { error: 'The position must be a whole number from 0 to 100000.' })
  const collapsed = b.collapsed === undefined ? true : b.collapsed
  if (typeof collapsed !== 'boolean') return json(422, { error: 'collapsed must be true or false.' })

  let text = body
  if (kind === 'table') {
    const t = checkTable(body)
    if (!t.ok) return json(422, { error: t.error })
    text = t.flat
  }
  if (kind === 'chart') {
    const c = checkChart(body)
    if (!c.ok) return json(422, { error: c.error })
    text = c.flat
  }
  // never stores patient-level data, secrets or credentials; never echoes the matched value
  const red = checkRedaction({ title, summary, body: text })
  if (!red.ok) return json(422, { error: red.message, kind: red.kind, field: red.field })

  let databaseId: string | null = null
  const db = typeof b.db === 'string' ? b.db.trim() : ''
  if (area === 'estate') {
    if (db && db.toLowerCase() !== 'estate') return json(422, { error: 'The estate area has no database. Leave db empty or use "estate".' })
  } else {
    if (!db) return json(422, { error: 'A db slug is required for background and build content.' })
    databaseId = await store.findDatabaseId(db)
    if (!databaseId) return json(422, { error: 'No database has that slug.' })
  }

  const r = await store.upsertSection({ database_id: databaseId, area, position, title, summary, kind, body, collapsed, token_id: token.id })
  return json(r.created ? 201 : 200, { id: r.id, created: r.created })
}
