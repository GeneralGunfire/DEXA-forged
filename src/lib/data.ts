import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/* ---------- errors ---------- */

export const SETUP = 'SETUP_REQUIRED'

type Res<T> = { data: T | null; error: { message: string; code?: string } | null }

export function unwrap<T>(res: Res<T>): T {
  if (res.error) {
    const e = new Error(res.error.message) as Error & { code?: string }
    e.code = res.error.code
    throw e
  }
  return res.data as T
}

export function describe(e: unknown): string {
  const err = e as { message?: string; code?: string; statusCode?: string }
  const msg = err?.message ?? 'Something went wrong.'
  if (
    err?.code === 'PGRST205' || err?.code === '42P01' ||
    /schema cache|does not exist|bucket not found/i.test(msg)
  ) return SETUP
  return msg
}

/* ---------- loading ---------- */

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let on = true
    setLoading(true)
    fn()
      .then((d) => { if (on) { setData(d); setError(null) } })
      .catch((e) => { if (on) setError(describe(e)) })
      .finally(() => { if (on) setLoading(false) })
    return () => { on = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps])

  return { data, error, loading, reload: () => setTick((t) => t + 1) }
}

/* ---------- team ---------- */

export type TeamMember = { user_id: string; display_name: string }
let teamCache: Promise<TeamMember[]> | null = null

function loadTeam(): Promise<TeamMember[]> {
  if (!teamCache) {
    teamCache = (async () => {
      const res = await supabase.from('team').select('user_id, display_name')
      return unwrap<TeamMember[]>(res) ?? []
    })().catch(() => {
      teamCache = null
      return [] as TeamMember[]
    })
  }
  return teamCache
}

export function useTeam() {
  const [team, setTeam] = useState<TeamMember[]>([])
  useEffect(() => {
    let on = true
    loadTeam().then((t) => { if (on) setTeam(t) })
    return () => { on = false }
  }, [])
  const name = (id?: string | null) => team.find((t) => t.user_id === id)?.display_name ?? ''
  return { team, name }
}

/* ---------- files ---------- */

export const BUCKET = 'forged-files'
export const MAX_BYTES = 50 * 1024 * 1024
export const ACCEPT_DOC = '.pdf,.doc,.docx,.mp4,.jpg,.jpeg,.png'
export const ACCEPT_BRAND = '.png,.jpg,.jpeg,.svg,.webp,.mp4'
export const ACCEPT_IMG = '.png,.jpg,.jpeg,.webp'

export function checkFile(file: File, accept: string): string | null {
  const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase()
  if (!accept.split(',').includes(ext)) return `${file.name}: that file type is not allowed.`
  if (file.size > MAX_BYTES) return `${file.name} is larger than 50 MB.`
  return null
}

export async function uploadFile(file: File, folder: string) {
  const raw = file.name.includes('.') ? (file.name.split('.').pop() ?? '') : ''
  const ext = raw.toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${folder}/${crypto.randomUUID()}${ext ? '.' + ext : ''}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  })
  if (error) throw error
  return { path, mime: file.type, size: file.size }
}

export async function removeFiles(paths: string[]) {
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
}

const urlCache = new Map<string, { url: string; exp: number }>()

export async function signedUrl(path: string, download?: string): Promise<string> {
  if (!download) {
    const hit = urlCache.get(path)
    if (hit && hit.exp > Date.now()) return hit.url
  }
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600, download ? { download } : undefined)
  if (error || !data) throw error ?? new Error('Could not create a link to that file.')
  if (!download) urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 })
  return data.signedUrl
}

export async function downloadFile(path: string, name: string) {
  const url = await signedUrl(path, name)
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function useSignedUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let on = true
    if (!path) { setUrl(null); return }
    signedUrl(path).then((u) => { if (on) setUrl(u) }).catch(() => { if (on) setUrl(null) })
    return () => { on = false }
  }, [path])
  return url
}

/* ---------- formatting ---------- */

export const fmtBytes = (n?: number | null) =>
  !n ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`

export const fmtDate = (iso?: string | null) =>
  iso
    ? new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('en-ZA', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : ''

export const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function fileKind(mime: string | null | undefined, name: string): string {
  const ext = (name.split('.').pop() ?? '').toLowerCase()
  if (mime === 'application/pdf' || ext === 'pdf') return 'PDF'
  if (ext === 'doc' || ext === 'docx' || (mime ?? '').includes('word')) return 'Word'
  if ((mime ?? '').startsWith('video/') || ext === 'mp4') return 'Video'
  if ((mime ?? '').startsWith('image/') || ['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext)) return 'Image'
  return 'File'
}

/* ---------- public post images (public bucket, so the landing page can show them) ---------- */

export const PUBLIC_BUCKET = 'public-posts'
export const MAX_POST_IMAGE = 10 * 1024 * 1024

export async function uploadPostImage(file: File) {
  const raw = file.name.includes('.') ? (file.name.split('.').pop() ?? '') : ''
  const ext = raw.toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `posts/${crypto.randomUUID()}${ext ? '.' + ext : ''}`
  const { error } = await supabase.storage.from(PUBLIC_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  })
  if (error) throw error
  return path
}

export async function removePostImages(paths: string[]) {
  if (paths.length) await supabase.storage.from(PUBLIC_BUCKET).remove(paths)
}

export const postImageUrl = (path: string) => supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl

export function checkPostImage(file: File): string | null {
  const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase()
  if (!ACCEPT_IMG.split(',').includes(ext)) return `${file.name}: only PNG, JPEG or WebP images.`
  if (file.size > MAX_POST_IMAGE) return `${file.name} is larger than 10 MB.`
  return null
}

/* ---------- who is signed in ---------- */

/** Display name of the signed-in team member (from the sign-in email), e.g. "Rajen". */
export function useMe(): string {
  const [me, setMe] = useState('')
  useEffect(() => {
    let on = true
    supabase.auth.getSession().then(({ data }) => {
      const raw = (data.session?.user.email ?? '').split('@')[0]
      if (on) setMe(raw.charAt(0).toUpperCase() + raw.slice(1))
    })
    return () => { on = false }
  }, [])
  return me
}
