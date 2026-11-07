import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import Landing from './pages/Landing'
import Login from './pages/Login'

// The private workspace code is only downloaded after a successful sign-in.
const Workspace = lazy(() => import('./pages/app/Shell'))

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
        <Route path="/login" element={session ? <Navigate to="/app" replace /> : <Login />} />
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
