import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { describe, fmtDate, unwrap, useLoad, useRole, useTeam } from '../../lib/data'
import { sha256Hex } from '../../lib/hash'
import { EmptyState, Field, LoadState, PageHead } from '../../components/ui'
import { sectionByPath } from './sections'
import './pages.css'
import './timeline.css'
import { useFeedback } from '../../components/feedback'

type Tok = { id: string; label: string; scope: string; created_at: string; last_used_at: string | null; revoked_at: string | null; created_by?: string | null }

/** A 256-bit random token. Only its SHA-256 hash is ever stored. */
function newToken(prefix = 'fgl_') {
  const b = crypto.getRandomValues(new Uint8Array(32))
  return prefix + btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export default function Settings() {
  const { confirm, toast } = useFeedback()
  const s = sectionByPath('settings')
  const me = useRole()
  const { name: who } = useTeam()
  const { data, error, loading, reload } = useLoad<Tok[]>(async () =>
    unwrap<Tok[]>(await supabase.from('log_tokens').select('id, label, scope, created_at, last_used_at, revoked_at, created_by').order('created_at', { ascending: false })) ?? [])
  const [fresh, setFresh] = useState<string | null>(null)
  const [shown, setShown] = useState(false)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/log-ingest`

  async function create(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const form = ev.currentTarget
    const submitter = (ev.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const scope = submitter?.value === 'content' ? 'content' : submitter?.value === 'read' ? 'read' : 'log'
    const label = String(new FormData(form).get('label') ?? '').trim()
    if (!label) return setErr('Name the token, for example "Phase 2 Claude Code".')
    setBusy(true)
    try {
      const token = newToken(scope === 'content' ? 'fgc_' : scope === 'read' ? 'fgr_' : 'fgl_')
      unwrap(await supabase.from('log_tokens').insert({ label, scope, token_hash: await sha256Hex(token) }))
      setFresh(token); setShown(false); setCopied(false); setErr(null); form.reset(); reload()
    } catch (e) { setErr(describe(e)) } finally { setBusy(false) }
  }
  async function revoke(t: Tok) {
    if (!await confirm(`Revoke "${t.label}"? Anything using it will stop working. This cannot be undone.`)) return
    try { unwrap(await supabase.from('log_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', t.id)); reload(); toast('Token revoked') } catch (e) { setErr(describe(e)) }
  }
  async function copy() {
    if (!fresh) return
    try { await navigator.clipboard.writeText(fresh); setCopied(true); toast('Token copied. Keep it somewhere safe.') } catch { setShown(true) }
  }

  return (
    <div className="pg">
      <PageHead title={s.label} blurb={s.blurb} />

      <section className="panel">
        <h3>Log access</h3>
        <p className="muted" style={{ marginBottom: 14 }}>
          A log token lets Claude Code and scripts add timeline entries without signing in. A content token lets it write the in-depth Background and Build record sections. Each can only write its own kind of content; neither can read or delete anything. A read token lets Claude Code read a record's context (background, build record, timeline, estate pages and document names) and cannot change anything.
        </p>

        {fresh && (
          <div className="tok__reveal" role="status">
            <strong>Copy this token now. It is shown only once.</strong>
            <code className={shown ? '' : 'blur'}>{fresh}</code>
            <div className="item__acts" style={{ justifyContent: 'flex-start' }}>
              <button type="button" className="btn btn--sm btn--dark" onClick={copy}>{copied ? 'Copied' : 'Copy token'}</button>
              <button type="button" className="btn btn--sm" onClick={() => setShown(!shown)}>{shown ? 'Hide' : 'Show'}</button>
              <button type="button" className="btn btn--sm" onClick={() => setFresh(null)}>I have saved it</button>
            </div>
          </div>
        )}

        <form onSubmit={create} style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px' }}><Field label="Token name"><input type="text" name="label" maxLength={80} placeholder="e.g. Phase 2 Claude Code" /></Field></div>
          <button type="submit" name="scope" value="log" className="btn btn--dark" disabled={busy} style={{ marginBottom: 14 }}>{busy ? 'Creating…' : 'Create log token'}</button>
          <button type="submit" name="scope" value="content" className="btn" disabled={busy} style={{ marginBottom: 14 }}>Create content token</button>
          <button type="submit" name="scope" value="read" className="btn" disabled={busy} style={{ marginBottom: 14 }}>Create read token</button>
        </form>
        {err && <p className="formerr" role="alert">{err}</p>}

        <h3 style={{ marginTop: 22 }}>{me.isAdmin ? 'All tokens' : 'Your tokens'}</h3>
        {!me.isAdmin && <p className="muted" style={{ marginBottom: 10 }}>You see and can revoke only the tokens you created. Create your own for your PC.</p>}
        <LoadState loading={loading && !data} error={error}>
          {data && data.length === 0 ? (
            <EmptyState title="No log tokens yet." text="Create one to let Claude Code write to the timeline." />
          ) : (
            <div className="rows">
              {(data ?? []).map((t) => (
                <div className={`tok${t.revoked_at ? ' is-revoked' : ''}`} key={t.id}>
                  <div className="item__main">
                    <p className="item__title">{t.label} <span className="chip">{t.scope === 'content' ? 'Content' : t.scope === 'read' ? 'Read' : 'Log'}</span></p>
                    <p className="item__meta">
                      Created {fmtDate(t.created_at)}{me.isAdmin && who(t.created_by) ? ` by ${who(t.created_by)}` : ''} ·{t.last_used_at ? `last used ${fmtDate(t.last_used_at)}` : 'never used'}
                      {t.revoked_at ? ` · revoked ${fmtDate(t.revoked_at)}` : ''}
                    </p>
                  </div>
                  {!t.revoked_at && <button type="button" className="btn btn--sm btn--danger" onClick={() => revoke(t)}>Revoke</button>}
                </div>
              ))}
            </div>
          )}
        </LoadState>
      </section>

      <section className="panel">
        <h3>Set up your computer</h3>
        <p className="muted">Set these two environment variables, then run <code>forged-log</code>. Details are in <code>docs/forged-log.md</code>.</p>
        <p style={{ margin: '10px 0 0', fontSize: 13 }}><b>FORGED_LOG_URL</b></p>
        <code style={{ display: 'block', overflowWrap: 'anywhere' }}>{endpoint}</code>
        <p style={{ margin: '10px 0 0', fontSize: 13 }}><b>FORGED_LOG_TOKEN</b> is the log token you copied above.</p>
        <p style={{ margin: '10px 0 0', fontSize: 13 }}><b>FORGED_CONTENT_URL</b></p>
        <code style={{ display: 'block', overflowWrap: 'anywhere' }}>{endpoint.replace('log-ingest', 'content-write')}</code>
        <p style={{ margin: '10px 0 0', fontSize: 13 }}><b>FORGED_CONTENT_TOKEN</b> is the content token.</p>
        <p style={{ margin: '10px 0 0', fontSize: 13 }}><b>FORGED_READ_URL</b></p>
        <code style={{ display: 'block', overflowWrap: 'anywhere' }}>{endpoint.replace('log-ingest', 'forge-read')}</code>
        <p style={{ margin: '10px 0 0', fontSize: 13 }}><b>FORGED_READ_TOKEN</b> is the read token. Read tokens are used with <code>forged-read</code>; details are in <code>docs/forged-read.md</code>.</p>
      </section>
    </div>
  )
}
