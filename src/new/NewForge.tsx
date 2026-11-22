import { lazy, Suspense } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Navigate, Route, Routes } from 'react-router-dom'
import NewLayout from './layout/NewLayout'
import Home from './pages/Home'
import ComingSoon from './pages/ComingSoon'
import { ALL_LEAVES } from './layout/nav'

// Built pages are their own download; every other menu item is still "Coming soon".
const Calendar = lazy(() => import('./pages/calendar/Calendar'))
const Announcements = lazy(() => import('./pages/announcements/Announcements'))
const Branding = lazy(() => import('./pages/branding/Branding'))
const Feedback = lazy(() => import('./pages/feedback/Feedback'))
const Settings = lazy(() => import('./pages/settings/Settings'))
const Databases = lazy(() => import('./pages/databases/Databases'))
const DbRecord = lazy(() => import('./pages/databases/Record'))
const Estate = lazy(() => import('./pages/estate/EstateOverview'))
const Documents = lazy(() => import('./pages/documents/Documents'))
const Reports = lazy(() => import('./pages/reports/Reports'))
const PlanOverview = lazy(() => import('./pages/work/PlanOverview'))
const PlanDb = lazy(() => import('./pages/work/PlanDb'))
const ProgressOverview = lazy(() => import('./pages/work/ProgressOverview'))
const ProgressDb = lazy(() => import('./pages/work/ProgressDb'))
const BUILT = ['/new/work/plan', '/new/work/progress', '/new/documentation/documents', '/new/documentation/reports', '/new/documentation/estate-overview', '/new/documentation/databases', '/new/admin/calendar', '/new/admin/announcements', '/new/admin/branding', '/new/admin/feedback', '/new/admin/settings']

export default function NewForge({ session }: { session: Session }) {
  const email = session.user.email ?? ''
  const raw = email.split('@')[0]
  const name = raw.charAt(0).toUpperCase() + raw.slice(1)
  return (
    <Routes>
      <Route element={<NewLayout name={name} />}>
        <Route index element={<Home name={name} />} />
        <Route path="admin/calendar" element={<Suspense fallback={null}><Calendar /></Suspense>} />
        <Route path="admin/announcements" element={<Suspense fallback={null}><Announcements /></Suspense>} />
        <Route path="admin/branding" element={<Suspense fallback={null}><Branding /></Suspense>} />
        <Route path="admin/feedback" element={<Suspense fallback={null}><Feedback /></Suspense>} />
        <Route path="admin/settings" element={<Suspense fallback={null}><Settings /></Suspense>} />
        <Route path="documentation/estate-overview" element={<Suspense fallback={null}><Estate /></Suspense>} />
        <Route path="documentation/documents" element={<Suspense fallback={null}><Documents /></Suspense>} />
        <Route path="documentation/reports" element={<Suspense fallback={null}><Reports /></Suspense>} />
        <Route path="documentation/databases" element={<Suspense fallback={null}><Databases /></Suspense>} />
        <Route path="documentation/databases/:id" element={<Suspense fallback={null}><DbRecord /></Suspense>} />
        <Route path="work/plan" element={<Suspense fallback={null}><PlanOverview /></Suspense>} />
        <Route path="work/progress" element={<Suspense fallback={null}><ProgressOverview /></Suspense>} />
        <Route path="work/progress/:id" element={<Suspense fallback={null}><ProgressDb /></Suspense>} />
        <Route path="work/plan/:id" element={<Suspense fallback={null}><PlanDb /></Suspense>} />
        {ALL_LEAVES.filter((l) => !BUILT.includes(l.to)).map((l) => (
          <Route key={l.to} path={l.to.replace('/new/', '')} element={<ComingSoon />} />
        ))}
        <Route path="*" element={<Navigate to="/new" replace />} />
      </Route>
    </Routes>
  )
}
