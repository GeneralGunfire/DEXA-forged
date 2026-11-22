import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import Landing from './pages/Landing'

// New Forge and its sign-in page are only downloaded when needed. The old workspace (src/pages/app) stays in the
// repository but is no longer routed: its old addresses redirect to the matching New Forge page.
const NewForge = lazy(() => import('./new/NewForge'))
const Login = lazy(() => import('./new/pages/login/Login'))

/** Old /app/... page names and the New Forge page that replaced each one. Anything not listed goes to /new. */
const OLD_TO_NEW: Record<string, string> = {
  databases: '/new/documentation/databases',
  documents: '/new/documentation/documents',
  reports: '/new/documentation/reports',
  schedule: '/new/admin/calendar',
  messages: '/new/admin/announcements',
  branding: '/new/admin/branding',
  feedback: '/new/admin/feedback',
  settings: '/new/admin/settings',
}

function OldApp() {
  const { '*': rest = '' } = useParams()
  const { search } = useLocation()
  const [page, id] = rest.split('/').filter(Boolean)
  const base = page ? OLD_TO_NEW[page] : undefined
  // a database record keeps its id; every other page goes to its new home
  const to = !base ? '/new' : page === 'databases' && id ? `${base}/${encodeURIComponent(id)}${search}` : base
  return <Navigate to={to} replace />
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setChecking(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (checking) return null

  const signIn = <Navigate to="/login" replace />
  return (
    <BrowserRouter>
      <Routes>
        {/* "/" is the app: signed in goes to New Forge, signed out goes to the sign-in page */}
        <Route path="/" element={<Navigate to={session ? '/new' : '/login'} replace />} />
        {/* the old landing page, kept but not linked from anywhere */}
        <Route path="/welcome" element={<Landing signedIn={!!session} />} />
        <Route path="/login" element={session ? <Navigate to="/new" replace /> : <Suspense fallback={null}><Login /></Suspense>} />
        <Route path="/new/*" element={session ? <Suspense fallback={null}><NewForge session={session} /></Suspense> : signIn} />
        <Route path="/app/*" element={session ? <OldApp /> : signIn} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
