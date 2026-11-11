// Supabase Edge Function: content-write
// Deploy with:  supabase functions deploy content-write --no-verify-jwt --project-ref <ref>
// Accepts one section of Background or Build record content per request, authenticated with a CONTENT token
// (Settings -> Content access). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to the function by
// Supabase itself and never leave it.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { handleContent, type ContentStore } from '../_shared/content.ts'

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void }

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

const store: ContentStore = {
  async findToken(hash) {
    const { data } = await admin.from('log_tokens')
      .select('id, revoked_at, window_start, window_count, scope').eq('token_hash', hash).maybeSingle()
    return data
  },
  async saveRate(id, windowStart, count, usedAt) {
    await admin.from('log_tokens').update({ window_start: windowStart, window_count: count, last_used_at: usedAt }).eq('id', id)
  },
  async findDatabaseId(slug) {
    const { data } = await admin.from('databases').select('id').eq('slug', slug).maybeSingle()
    return data?.id ?? null
  },
  async upsertSection(s) {
    const scope = s.database_id ?? 'estate'
    const { data: existing } = await admin.from('db_content').select('id')
      .eq('scope_key', scope).eq('area', s.area).eq('title', s.title).maybeSingle()
    const row = { ...s, updated_at: new Date().toISOString() }
    if (existing) {
      const { error } = await admin.from('db_content').update(row).eq('id', existing.id)
      if (error) throw error
      return { id: existing.id, created: false }
    }
    const { data, error } = await admin.from('db_content').insert(row).select('id').single()
    if (error) throw error
    return { id: data.id, created: true }
  },
}

Deno.serve(async (req) => {
  try {
    return await handleContent(req, store)
  } catch {
    return new Response(JSON.stringify({ error: 'The content could not be saved. Try again shortly.' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
})
