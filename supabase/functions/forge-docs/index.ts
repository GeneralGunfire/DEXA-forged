// Supabase Edge Function: forge-docs
// Deploy with:  supabase functions deploy forge-docs --no-verify-jwt --project-ref <ref>
// Lets Claude Code list, fetch, add and describe documents, authenticated with a DOCS token
// (Settings -> Create docs token). It cannot delete anything and never changes a file in place:
// a changed document is a new version that replaces the current one and keeps the old one as history.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to the function by Supabase itself and never leave it.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { handleDocs, type DocMeta, type DocsStore } from '../_shared/docs.ts'

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void }

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})
const BUCKET = 'forged-files'

type Row = Record<string, unknown>
const dbMeta = (r: Row): DocMeta => ({
  ref: `d:${r.id}`, db: ((r.databases as { slug?: string } | null)?.slug) ?? '', name: String(r.name), folder: '', tags: (r.tags as string[]) ?? [],
  reason: String(r.reason ?? ''), made_by: String(r.made_by ?? ''), description: String(r.description ?? ''), document_date: (r.document_date as string) ?? null,
  created_at: String(r.created_at), size: (r.size as number) ?? null, mime: (r.mime as string) ?? null, current: r.is_current !== false,
  replaces: r.replaces_id ? `d:${r.replaces_id}` : null,
})
const genMeta = (r: Row): DocMeta => ({
  ref: `g:${r.id}`, db: 'estate', name: String(r.name), folder: String(r.folder ?? ''), tags: (r.tags as string[]) ?? [],
  reason: String(r.reason ?? ''), made_by: String(r.made_by ?? ''), description: String(r.description ?? ''), document_date: String(r.created_at).slice(0, 10),
  created_at: String(r.created_at), size: (r.size as number) ?? null, mime: (r.mime as string) ?? null, current: r.is_current !== false,
  replaces: r.replaces_id ? `g:${r.replaces_id}` : null,
})
const DB_COLS = 'id, name, description, document_date, mime, size, is_current, replaces_id, reason, tags, made_by, created_at, databases(slug)'
const GEN_COLS = 'id, name, folder, description, mime, size, is_current, replaces_id, reason, tags, made_by, created_at'

const store: DocsStore = {
  async findToken(hash) {
    const { data } = await admin.from('log_tokens')
      .select('id, revoked_at, window_start, window_count, scope').eq('token_hash', hash).maybeSingle()
    return data
  },
  async saveRate(id, windowStart, count, usedAt) {
    await admin.from('log_tokens').update({ window_start: windowStart, window_count: count, last_used_at: usedAt }).eq('id', id)
  },
  async findDatabase(slug) {
    const { data } = await admin.from('databases').select('id, slug').eq('slug', slug).maybeSingle()
    return data ?? null
  },
  async listDocs({ database_id, folder, limit, history }) {
    const out: DocMeta[] = []
    if (database_id !== null) {
      let q = admin.from('db_documents').select(DB_COLS)
      if (database_id !== 'all') q = q.eq('database_id', database_id)
      if (!history) q = q.eq('is_current', true)
      if (!folder) { const { data } = await q.order('created_at', { ascending: false }).limit(limit); out.push(...(data ?? []).map((r) => dbMeta(r as Row))) }
    }
    if (database_id === null || database_id === 'all') {
      let q = admin.from('documents').select(GEN_COLS).is('database_id', null)
      if (!history) q = q.eq('is_current', true)
      if (folder) q = q.eq('folder', folder)
      const { data } = await q.order('created_at', { ascending: false }).limit(limit)
      out.push(...(data ?? []).map((r) => genMeta(r as Row)))
    }
    return out.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit)
  },
  async getDoc(ref) {
    const t = ref.kind === 'db' ? 'db_documents' : 'documents'
    const { data } = await admin.from(t).select(`${ref.kind === 'db' ? DB_COLS : GEN_COLS}, path`).eq('id', ref.id).maybeSingle()
    if (!data) return null
    const r = data as unknown as Row
    return { ...(ref.kind === 'db' ? dbMeta(r) : genMeta(r)), path: String(r.path) }
  },
  async findCurrentByName(kind, databaseId, name) {
    if (kind === 'db') {
      const { data } = await admin.from('db_documents').select('id').eq('database_id', databaseId!).eq('name', name).eq('is_current', true).maybeSingle()
      return data ? { kind: 'db', id: data.id } : null
    }
    const { data } = await admin.from('documents').select('id').is('database_id', null).eq('name', name).eq('is_current', true).maybeSingle()
    return data ? { kind: 'general', id: data.id } : null
  },
  async putFile(path, bytes, mime) {
    const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false })
    if (error) throw error
  },
  async readFile(path) {
    const { data, error } = await admin.storage.from(BUCKET).download(path)
    if (error || !data) return null
    return new Uint8Array(await data.arrayBuffer())
  },
  async insertDoc(d) {
    if (d.kind === 'db') {
      const { data, error } = await admin.from('db_documents').insert({
        database_id: d.database_id, name: d.name, description: d.description, document_date: d.document_date, path: d.path, mime: d.mime, size: d.size,
        is_current: true, replaces_id: d.replaces_id, entry_id: d.entry_id, reason: d.reason, tags: d.tags, made_by: d.made_by,
      }).select('id').single()
      if (error) throw error
      return { kind: 'db', id: data.id }
    }
    const { data, error } = await admin.from('documents').insert({
      name: d.name, path: d.path, mime: d.mime, size: d.size, database_id: null, folder: d.folder, description: d.description,
      reason: d.reason, tags: d.tags, made_by: d.made_by, is_current: true, replaces_id: d.replaces_id,
    }).select('id').single()
    if (error) throw error
    return { kind: 'general', id: data.id }
  },
  async supersede(ref) {
    const { error } = await admin.from(ref.kind === 'db' ? 'db_documents' : 'documents').update({ is_current: false }).eq('id', ref.id)
    if (error) throw error
  },
  async updateDoc(ref, patch) {
    const p: Row = { ...patch }
    if (ref.kind === 'general') delete p.document_date // general documents are dated by when they were added
    if (Object.keys(p).length === 0) return
    const { error } = await admin.from(ref.kind === 'db' ? 'db_documents' : 'documents').update(p).eq('id', ref.id)
    if (error) throw error
  },
}

Deno.serve(async (req) => {
  try {
    return await handleDocs(req, store)
  } catch {
    // never leak internals (or any stored text) in an error
    return new Response(JSON.stringify({ error: 'The document request could not be completed. Try again shortly.' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
})
