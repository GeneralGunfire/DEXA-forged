import { cn } from '@/lib/utils'

/**
 * Loading states for New Forge. Instead of the word "Loading…", pages show a skeleton shaped like what is about to
 * appear (list rows, cards, a detail page, a table) or a small spinner for panels. Palette colours only.
 *
 * - It waits about 120 ms before showing, so a fast load never flashes a skeleton.
 * - It is announced to screen readers as "Loading…" (role="status").
 * - The pulse and spin stop when the person has asked for reduced motion.
 */

const WAIT = { animationDelay: '120ms', animationFillMode: 'backwards' } as const
const pulse = 'animate-pulse motion-reduce:animate-none'

/** One grey block of a skeleton. */
export function Bar({ className, step = 0 }: { className?: string; step?: number }) {
  return <div aria-hidden="true" className={cn('rounded-md bg-secondary', pulse, className)} style={step ? { animationDelay: `${step * 120}ms` } : undefined} />
}

/** A small spinning ring. */
export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('inline-block size-4 shrink-0 rounded-full border-2 border-border border-t-primary animate-spin motion-reduce:animate-none', className)} />
}

/** Spinner plus a short label, for panels, small widgets and buttons' neighbours. */
export function InlineLoading({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn('nf-fade flex items-center gap-2.5 text-sm text-muted-foreground', className)} style={WAIT}>
      <Spinner />
      <span>{label}…</span>
    </div>
  )
}

const widths = ['w-2/5', 'w-1/2', 'w-1/3', 'w-3/5', 'w-2/5', 'w-1/2']

function Rows({ n }: { n: number }) {
  return (
    <ul className="divide-y divide-border border-y border-border">
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="flex items-center gap-4 px-3 py-4">
          <div className="min-w-0 flex-1 space-y-2.5">
            <Bar step={i} className={cn('h-3.5', widths[i % widths.length])} />
            <Bar step={i} className={cn('h-3 opacity-60', widths[(i + 3) % widths.length])} />
          </div>
          <Bar step={i} className="hidden h-3 w-20 sm:block" />
          <Bar step={i} className="h-5 w-14 rounded-full" />
        </li>
      ))}
    </ul>
  )
}

function Cards({ n }: { n: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-border p-4">
          <Bar step={i} className="h-24 w-full opacity-70" />
          <Bar step={i} className="h-3.5 w-3/4" />
          <Bar step={i} className="h-3 w-1/2 opacity-60" />
        </div>
      ))}
    </div>
  )
}

const COLS = ['w-1/4', 'w-1/6', 'w-1/5', 'w-1/6']

function Table({ n }: { n: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex gap-4 border-b border-border bg-card px-3 py-3">
        {COLS.map((w, i) => <div key={i} className={w}><Bar step={i} className="h-3" /></div>)}
      </div>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex gap-4 border-b border-border/60 px-3 py-3.5 last:border-b-0">
          {COLS.map((w, j) => <div key={j} className={w}><Bar step={i} className="h-3" /></div>)}
        </div>
      ))}
    </div>
  )
}

const LINES = ['w-full', 'w-11/12', 'w-full', 'w-2/3']

function Detail() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Bar className="h-9 w-72 max-w-full" />
        <Bar step={1} className="h-3.5 w-96 max-w-full opacity-60" />
      </div>
      <div className="flex gap-2">{[0, 1, 2, 3].map((i) => <Bar key={i} step={i} className="h-8 w-24" />)}</div>
      <div className="space-y-3 border-t border-border pt-6">
        {LINES.map((w, i) => <Bar key={i} step={i} className={cn('h-3.5', w)} />)}
      </div>
      <Rows n={3} />
    </div>
  )
}

export type LoadingVariant = 'rows' | 'cards' | 'table' | 'detail'

/**
 * A skeleton for a part of a page that is still loading. Pick the variant that looks like the content:
 * rows (lists), cards (grids), table, or detail (a whole record page).
 */
export function Loading({ variant = 'rows', rows = 5, label = 'Loading', className }: { variant?: LoadingVariant; rows?: number; label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={cn('nf-fade', className)} style={WAIT}>
      <span className="sr-only">{label}…</span>
      {variant === 'cards' ? <Cards n={Math.min(rows, 6)} /> : variant === 'table' ? <Table n={rows} /> : variant === 'detail' ? <Detail /> : <Rows n={rows} />}
    </div>
  )
}

/** Shown while a page's code is loading (instead of a blank screen): the usual page header, then rows. */
export function RouteLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="nf-fade mx-auto w-full max-w-6xl px-5 pb-16 pt-8 sm:px-8 sm:pt-10" style={WAIT}>
      <span className="sr-only">Loading…</span>
      <Bar className="h-3 w-20" />
      <Bar step={1} className="mt-3 h-9 w-56" />
      <Bar step={2} className="mt-3 h-3.5 w-80 max-w-full opacity-60" />
      <div className="mt-10"><Rows n={5} /></div>
    </div>
  )
}
