import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY (see .env.example)')
}

const REMEMBER = 'forged_remember'

/** "Keep me signed in" -> localStorage; otherwise the session lasts until the tab is closed. */
export const setRemember = (remember: boolean) => {
  try { localStorage.setItem(REMEMBER, remember ? '1' : '0') } catch { /* storage blocked */ }
}
const target = (): Storage => {
  try { return localStorage.getItem(REMEMBER) === '1' ? localStorage : sessionStorage } catch { return sessionStorage }
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: {
      getItem: (k) => localStorage.getItem(k) ?? sessionStorage.getItem(k),
      setItem: (k, v) => target().setItem(k, v),
      removeItem: (k) => { localStorage.removeItem(k); sessionStorage.removeItem(k) },
    },
  },
})
