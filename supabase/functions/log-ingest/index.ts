// Supabase Edge Function: log-ingest
// Deploy with:  supabase functions deploy log-ingest --no-verify-jwt --project-ref <ref>
// (the function checks its own bearer token, so Supabase's JWT check is switched off).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to the function by Supabase
// itself; the service-role key is never in the repo or the client.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { handleIngest, type IngestStore } from '../_shared/ingest.ts'

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void }

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

const store: IngestStore = {
  async findToken(hash) {
    const { data } = await admin.from('log_tokens')
      .select('id, revoked_at, window_start, window_count').eq('token_hash', hash).maybeSingle()
    return data
  },
  async saveRate(id, windowStart, count, usedAt) {
    await admin.from('log_tokens').update({ window_start: windowStart, window_count: count, last_used_at: usedAt }).eq('id', id)
  },
  async findDatabaseId(slug) {
    const { data } = await admin.from('databases').select('id').eq('slug', slug).maybeSingle()
    return data?.id ?? null
  },
  async findEntry(id) {
    const { data } = await admin.from('timeline_entries').select('id, type, database_id').eq('id', id).maybeSingle()
    return data
  },
  async insertEntry(e) {
    const { data, error } = await admin.from('timeline_entries').insert(e).select('id').single()
    if (error) throw error
    return data.id
  },
  async resolveEntry(id) {
    await admin.from('timeline_entries').update({ status: 'Resolved' }).eq('id', id)
  },
}

Deno.serve(async (req) => {
  try {
    return await handleIngest(req, store)
  } catch {
    // never leak internals (or any submitted text) in an error
    return new Response(JSON.stringify({ error: 'The log could not be saved. Try again shortly.' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
})
