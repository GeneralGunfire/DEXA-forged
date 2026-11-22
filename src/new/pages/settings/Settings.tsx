import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { describe, useTeam } from '../../../lib/data'
import { BUCKET, setProfile, useProfile } from '../../lib/profile'
import { btn, btnPrimary, field } from '../calendar/cal'

const TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 2 * 1024 * 1024
const SIZE = 256

/** Centre-crop to a square and shrink to 256 px, in the browser, before anything is uploaded. */
async function squareBlob(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('That file could not be read as a picture.')); i.src = url })
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const c = document.createElement('canvas'); c.width = SIZE; c.height = SIZE
    const g = c.getContext('2d')
    if (!g) throw new Error('This browser cannot resize pictures.')
    g.imageSmoothingQuality = 'high'
    g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE)
    return await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('Could not prepare the picture.'))), 'image/jpeg', 0.9))
  } finally { URL.revokeObjectURL(url) }
}

/** Only the signed-in person's own picture and status tag. The id comes from the session, never from input. */
export default function Settings() {
  const profile = useProfile()
  const { team } = useTeam()
  const me = team.find((t) => t.user_id === profile.userId)
  const [tag, setTag] = useState('')
  const [pending, setPending] = useState<{ blob: Blob; url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const pick = useRef<HTMLInputElement>(null)
  const seeded = useRef(false)

  useEffect(() => { if (profile.loaded && !seeded.current) { seeded.current = true; setTag(profile.status) } }, [profile.loaded, profile.status])
  useEffect(() => () => { if (pending) URL.revokeObjectURL(pending.url) }, [pending])

  async function choose(f: File | undefined) {
    if (!f) return
    setMsg(null)
    if (!TYPES.includes(f.type)) return setMsg({ ok: false, t: 'Use a JPEG, PNG or WebP picture.' })
    if (f.size > MAX_BYTES) return setMsg({ ok: false, t: 'That picture is larger than 2 MB. Choose a smaller one.' })
    try {
      const blob = await squareBlob(f)
      setPending({ blob, url: URL.createObjectURL(blob) })
    } catch (e) { setMsg({ ok: false, t: describe(e) }) }
  }

  async function write(avatarPath: string | null, statusTag: string) {
    const id = profile.userId
    if (!id) throw new Error('Not signed in.')
    const now = new Date().toISOString()
    // an upsert on the person's own row only (the database also enforces this)
    const { error } = await supabase.from('member_profiles').upsert({ user_id: id, avatar_path: avatarPath, status_tag: statusTag.trim().slice(0, 40), updated_at: now }, { onConflict: 'user_id' })
    if (error) throw error
    setProfile({ avatarPath, status: statusTag.trim().slice(0, 40), updatedAt: now })
  }

  async function save() {
    if (busy) return
    setBusy(true); setMsg(null)
    try {
      let path = profile.avatarPath
      if (pending) {
        if (!profile.userId) throw new Error('Not signed in.')
        path = `avatars/${profile.userId}/${crypto.randomUUID()}.jpg`
        const { error } = await supabase.storage.from(BUCKET).upload(path, pending.blob, { contentType: 'image/jpeg', upsert: false })
        if (error) throw error
      }
      await write(path, tag)
      setPending(null)
      setMsg({ ok: true, t: 'Saved. Your sidebar is updated.' })
    } catch (e) {
      setMsg({ ok: false, t: describe(e) })
    } finally { setBusy(false) }
  }

  async function removePicture() {
    if (busy) return
    setBusy(true); setMsg(null)
    try { await write(null, profile.status); setPending(null); setMsg({ ok: true, t: 'Picture removed.' }) }
    catch (e) { setMsg({ ok: false, t: describe(e) }) }
    finally { setBusy(false) }
  }

  const shown = pending?.url ?? profile.avatarUrl
  const name = me?.display_name ?? ''
  const dirty = !!pending || tag.trim() !== profile.status

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-24 pt-8 sm:px-8 sm:pt-10">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Admin</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Settings</h1>
      <p className="mt-2 text-sm text-muted-foreground">Your picture and status tag, shown in the sidebar.</p>

      <section className="mt-10 border-t border-border pt-6">
        <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Name</h2>
        <p className="mt-3 text-lg font-medium">{name || <span className="text-muted-foreground">Loading…</span>}</p>
        <p className="mt-1 text-sm text-muted-foreground">{me?.role === 'member' ? 'Member' : me ? 'Admin' : ''}</p>
      </section>

      <section className="mt-10 border-t border-border pt-6">
        <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Picture</h2>
        <div className="mt-5 flex flex-wrap items-center gap-6">
          <span className="grid size-28 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-primary text-3xl font-semibold text-primary-foreground">
            {shown ? <img src={shown} alt="Your picture" className="size-full object-cover" /> : (name.charAt(0) || '?')}
          </span>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn} onClick={() => pick.current?.click()} disabled={busy}><ImagePlus className="size-4" aria-hidden="true" /> {shown ? 'Choose another' : 'Choose a picture'}</button>
              {profile.avatarPath || pending ? (
                <button type="button" className={btn} onClick={() => (pending ? setPending(null) : removePicture())} disabled={busy}><Trash2 className="size-4" aria-hidden="true" /> {pending ? 'Discard' : 'Remove picture'}</button>
              ) : null}
            </div>
            <p className="max-w-sm text-xs leading-5 text-muted-foreground">JPEG, PNG or WebP, up to 2 MB. It is cropped to a square and resized to {SIZE} px here in your browser before it is uploaded.</p>
          </div>
          <input ref={pick} type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = '' }} />
        </div>
      </section>

      <section className="mt-10 border-t border-border pt-6">
        <label className="block text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground" htmlFor="tag">Status tag</label>
        <input id="tag" className={field + ' mt-4 max-w-sm'} value={tag} maxLength={40} placeholder="e.g. Working on Phase 2" onChange={(e) => setTag(e.target.value)} />
        <p className="mt-2 text-xs text-muted-foreground">{tag.length} of 40 characters. Shown under your name in the sidebar instead of your role. Leave it empty to show your role.</p>
      </section>

      <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-border pt-6">
        <button type="button" className={btnPrimary} disabled={busy || !dirty || !profile.userId} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        {msg ? <span className={msg.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'} role={msg.ok ? 'status' : 'alert'}>{msg.t}</span> : null}
      </div>
    </div>
  )
}
