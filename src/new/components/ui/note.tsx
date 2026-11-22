import { useEffect, useRef, type ReactNode } from 'react'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A message that goes right under the thing that caused it (a button, a form). It scrolls itself into view when it
 * appears or changes, so an error can never be hiding below the edge of a panel. Errors use role="alert" so screen
 * readers announce them.
 */
export function Note({ ok = false, children, className }: { ok?: boolean; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ref.current?.scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' })
  }, [children])
  const Icon = ok ? CircleCheck : CircleAlert
  return (
    <div
      ref={ref}
      role={ok ? 'status' : 'alert'}
      className={cn(
        'mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-sm leading-5',
        ok ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-destructive/60 bg-destructive/10 text-destructive',
        className,
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{children}</span>
    </div>
  )
}
