// Supabase Edge Function: forge-read
// Deploy with:  supabase functions deploy forge-read --no-verify-jwt --project-ref <ref>
// Read-only context for Claude Code, authenticated with a READ token (Settings -> Create read token).
// SELECT only. The only write is the token's own usage counters (window_start, window_count, last_used_at).
// It selects named columns only: never log_tokens (apart from the caller's own token lookup), token hashes,
// edit history, file paths or any other table. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to the
// function by Supabase itself and never leave it.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { handleRead, type ReadStore, type DbRow } from '../_shared/read.ts'

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void }

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

const DB_COLUMNS = 'id, slug, name, machine, db_type, status, port, instance_name, background, shortfalls, build_record'

const store: ReadStore = {
  async findToken(hash) {
    const { data } = await admin.from('log_tokens')
      .select('id, revoked_at, window_start, window_count, scope').eq('token_hash', hash).maybeSingle()
    return data
  },
  async saveRate(id, windowStart, count, usedAt) {
    await admin.from('log_tokens').update({ window_start: windowStart, window_count: count, last_used_at: usedAt }).eq('id', id)
  },
  async findDatabase(slug) {
    const { data } = await admin.from('databases').select(DB_COLUMNS).eq('slug', slug).maybeSingle()
    return (data as DbRow | null) ?? null
  },
  async listDatabases() {
    const { data } = await admin.from('databases').select('slug, name, machine, db_type, status').not('slug', 'is', null).order('name')
    return data ?? []
  },
  async listSections(databaseId, area, limit, withBody) {
    let q = admin.from('db_content').select(withBody ? 'area, position, title, summary, kind, body, updated_at' : 'area, position, title, summary, kind, updated_at')
    q = databaseId ? q.eq('database_id', databaseId) : q.is('database_id', null)
    if (area) q = q.eq('area', area)
    const { data } = await q.order('area').order('position').limit(limit)
    return (data ?? []).map((r) => ({ body: '', ...r })) as never
  },
  async listEntries(databaseId, since, limit) {
    let q = admin.from('timeline_entries')
      .select('id, parent_id, happened_at, type, phase, author, title, summary, detail, status, session_label')
    q = databaseId ? q.eq('database_id', databaseId) : q.is('database_id', null)
    if (since) q = q.gte('happened_at', since)
    const { data } = await q.order('happened_at', { ascending: false }).limit(limit)
    return data ?? []
  },
  async listDocuments(databaseId, limit) {
    const { data } = await admin.from('db_documents').select('name, document_date, size, is_current')
      .eq('database_id', databaseId).order('document_date', { ascending: false }).limit(limit)
    return data ?? []
  },
}

Deno.serve(async (req) => {
  try {
    return await handleRead(req, store)
  } catch {
    // never leak internals (or any stored text) in an error
    return new Response(JSON.stringify({ error: 'The read could not be completed. Try again shortly.' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
})
