import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Note } from './note'

// Only the top-most dialog (or viewer) answers Escape, so closing a popup never closes the one behind it.
const stack: symbol[] = []
export function useEscape(onEscape: () => void, active = true) {
  const id = useRef(Symbol('escape'))
  const fn = useRef(onEscape)
  fn.current = onEscape
  useEffect(() => {
    if (!active) return
    const me = id.current
    stack.push(me)
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented && stack[stack.length - 1] === me) fn.current() }
    document.addEventListener('keydown', h)
    return () => { document.removeEventListener('keydown', h); const i = stack.indexOf(me); if (i >= 0) stack.splice(i, 1) }
  }, [active])
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
const visible = (el: HTMLElement) => el.offsetParent !== null || el === document.activeElement

const SIZES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-2xl', xl: 'max-w-5xl' } as const

/**
 * A popup. It sits above the page, keeps keyboard focus inside while open (Tab cycles), closes on Escape or a click
 * on the dark backdrop, and gives focus back to whatever opened it. Select lists and date pickers open above it.
 */
export function Dialog({ open, onClose, title, header, footer, notice, children, size = 'md', variant = 'center', bodyClassName, dismissable = true, label }: {
  open: boolean; onClose: () => void; title?: ReactNode; header?: ReactNode; footer?: ReactNode; notice?: ReactNode; children: ReactNode
  size?: keyof typeof SIZES; variant?: 'center' | 'sheet' | 'full'; bodyClassName?: string; dismissable?: boolean; label?: string
}) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useEscape(() => { if (dismissable) onClose() }, open)

  useEffect(() => {
    if (!open) return
    const before = document.activeElement as HTMLElement | null
    const p = panel.current
    const first = p?.querySelector<HTMLElement>('[data-autofocus]') ?? Array.from(p?.querySelectorAll<HTMLElement>('[data-body] ' + FOCUSABLE.split(',').join(',[data-body] ')) ?? []).find(visible)
    ;(first ?? p)?.focus({ preventScroll: true })
    return () => { before?.focus?.({ preventScroll: true }) }
  }, [open])

  if (!open) return null
  const trap = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const items = Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(visible)
    if (!items.length) { e.preventDefault(); panel.current?.focus(); return }
    const a = items[0], z = items[items.length - 1]
    if (e.shiftKey && (document.activeElement === a || document.activeElement === panel.current)) { e.preventDefault(); z.focus() }
    else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus() }
  }

  return createPortal(
    <div
      className={cn('nf-fade fixed inset-0 z-50 flex overscroll-contain bg-black/60', variant === 'center' && 'items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-8', variant === 'sheet' && 'justify-end')}
      onMouseDown={(e) => { if (e.target === e.currentTarget && dismissable) onClose() }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={header || label ? undefined : titleId}
        aria-label={label}
        tabIndex={-1}
        onKeyDown={trap}
        className={cn(
          'nf-rise flex min-h-0 flex-col bg-background outline-none',
          variant === 'center' && cn('w-full max-h-[calc(100svh-2rem)] rounded-xl border border-border shadow-2xl sm:max-h-[calc(100svh-4rem)]', SIZES[size]),
          variant === 'sheet' && 'h-full w-full max-w-xl border-l border-border shadow-2xl',
          variant === 'full' && 'h-full w-full',
        )}
      >
        {header ?? (title ? (
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-6 py-4">
            <h2 id={titleId} className="text-base font-semibold tracking-tight">{title}</h2>
            {dismissable ? <CloseButton onClose={onClose} /> : null}
          </div>
        ) : null)}
        <div data-body className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', bodyClassName ?? 'px-6 py-5')}>{children}</div>
        {notice ? <div className="shrink-0 border-t border-border px-6 pb-1 pt-0"><Note>{notice}</Note></div> : null}
        {footer ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-6 py-4">{footer}</div> : null}
      </div>
    </div>,
    document.getElementById('nf-root') ?? document.body,
  )
}

export function CloseButton({ onClose, className }: { onClose: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClose} aria-label="Close" className={cn('grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground', className)}>
      <X aria-hidden="true" className="size-4" />
    </button>
  )
}
