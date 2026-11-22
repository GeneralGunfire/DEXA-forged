import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import Landing from './pages/Landing'
import Login, { NEXT_KEY } from './pages/Login'

// The private workspace code is only downloaded after a successful sign-in.
const Workspace = lazy(() => import('./pages/app/Shell'))
const NewForge = lazy(() => import('./new/NewForge'))

/** After sign-in: /new if the person pressed "New Forge" on the login page, otherwise the old site as before. */
function AfterLogin() {
  const [to] = useState(() => {
    const asked = new URLSearchParams(window.location.search).get('to') === 'new'
    try { return asked || sessionStorage.getItem(NEXT_KEY) === 'new' ? '/new' : '/app' } catch { return asked ? '/new' : '/app' }
  })
  useEffect(() => { try { sessionStorage.removeItem(NEXT_KEY) } catch { /* storage blocked */ } }, [])
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

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing signedIn={!!session} />} />
        <Route path="/login" element={session ? <AfterLogin /> : <Login />} />
        <Route path="/new/*" element={
            session ? (
              <Suspense fallback={null}>
                <NewForge session={session} />
              </Suspense>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="/app/*" element={
            session ? (
              <Suspense fallback={null}>
                <Workspace session={session} />
              </Suspense>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
