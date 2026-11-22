import { useLocation } from 'react-router-dom'
import { ALL_LEAVES } from '../layout/nav'

export default function ComingSoon() {
  const { pathname } = useLocation()
  const title = ALL_LEAVES.find((l) => l.to === pathname)?.label ?? 'This page'
  return (
    <div className="mx-auto w-full max-w-5xl px-5 pb-16 pt-8 sm:px-8 sm:pt-10">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">New Forge</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h1>
      <p className="mt-3 text-base text-muted-foreground">Coming soon.</p>
    </div>
  )
}
