import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from '../../lib/supabase'

// The signed-in person's own profile (picture and status tag), shared by the sidebar and the Settings page.
// Only ever the signed-in user's own row: the id always comes from the current session, never from input.

export const BUCKET = 'public-posts'
type State = { userId: string | null; avatarPath: string | null; avatarUrl: string | null; status: string; loaded: boolean }
let state: State = { userId: null, avatarPath: null, avatarUrl: null, status: '', loaded: false }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export const avatarUrl = (path: string, version?: string | number) =>
  supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl + (version ? `?v=${version}` : '')

export function setProfile(p: { userId?: string; avatarPath: string | null; status: string; updatedAt?: string | null }) {
  state = {
    userId: p.userId ?? state.userId, avatarPath: p.avatarPath, status: p.status, loaded: true,
    avatarUrl: p.avatarPath ? avatarUrl(p.avatarPath, p.updatedAt ? Date.parse(p.updatedAt) : Date.now()) : null,
  }
  emit()
}

export async function loadProfile() {
  const { data: s } = await supabase.auth.getSession()
  const id = s.session?.user.id
  if (!id) return
  const { data } = await supabase.from('member_profiles').select('avatar_path, status_tag, updated_at').eq('user_id', id).maybeSingle()
  const r = data as { avatar_path: string | null; status_tag: string; updated_at: string } | null
  setProfile({ userId: id, avatarPath: r?.avatar_path ?? null, status: r?.status_tag ?? '', updatedAt: r?.updated_at })
}

export function useProfile() {
  const snap = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, () => state)
  useEffect(() => { if (!state.loaded) loadProfile().catch(() => undefined) }, [])
  return snap
}
