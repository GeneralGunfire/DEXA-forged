import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

type Pos = { top: number; left: number; maxH: number; width?: number }
const M = 8 // keep this far from the screen edge
const GAP = 6

/**
 * A floating panel anchored to an element. It renders in the New Forge root (so no parent can clip it),
 * flips above the anchor when there is no room below, stays inside the screen, follows scrolling and resizing,
 * closes on Escape (before any dialog behind it does), on a click outside, and when Tab leaves it.
 */
export function Popover({ anchor, open, onClose, children, className, matchWidth = false, keepFocus = false, role, id, align = 'start', label }: {
  anchor: RefObject<HTMLElement | null>; open: boolean; onClose: () => void; children: ReactNode
  className?: string; matchWidth?: boolean; keepFocus?: boolean; role?: string; id?: string; align?: 'start' | 'end'; label?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<Pos | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  const place = useCallback(() => {
    const a = anchor.current, p = ref.current
    if (!a || !p) return
    const r = a.getBoundingClientRect()
    const vw = window.innerWidth, vh = window.innerHeight
    const natural = p.scrollHeight + 2
    const below = vh - r.bottom - GAP - M
    const above = r.top - GAP - M
    const down = natural <= below || below >= above
    const maxH = Math.max(120, down ? below : above)
    const h = Math.min(natural, maxH)
    const w = matchWidth ? r.width : p.offsetWidth
    let left = align === 'end' ? r.right - w : r.left
    left = Math.min(Math.max(M, left), Math.max(M, vw - w - M))
    const next: Pos = { top: down ? r.bottom + GAP : r.top - GAP - h, left, maxH, width: matchWidth ? r.width : undefined }
    setPos((prev) => (prev && prev.top === next.top && prev.left === next.left && prev.maxH === next.maxH && prev.width === next.width ? prev : next))
  }, [anchor, matchWidth, align])

  // measure after every render while open, so a change of content (another month, a longer list) re-fits
  useLayoutEffect(() => { if (open) place(); else setPos(null) })

  useEffect(() => {
    if (!open) return
    const move = () => place()
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return
      closeRef.current()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation(); e.preventDefault()
        closeRef.current()
        anchor.current?.focus()
      } else if (e.key === 'Tab' && ref.current?.contains(document.activeElement)) {
        closeRef.current()
        anchor.current?.focus() // the browser then carries on from the anchor
      }
    }
    window.addEventListener('resize', move)
    window.addEventListener('scroll', move, true)
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('resize', move)
      window.removeEventListener('scroll', move, true)
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('keydown', key, true)
    }
  }, [open, place, anchor])

  if (!open) return null
  return createPortal(
    <div
      ref={ref}
      id={id}
      role={role}
      aria-label={label}
      onMouseDown={keepFocus ? (e) => e.preventDefault() : undefined}
      style={{ position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, maxHeight: pos?.maxH, width: pos?.width, visibility: pos ? 'visible' : 'hidden' }}
      className={cn('nf-pop z-[70] overflow-auto overscroll-contain rounded-lg border border-border bg-card text-card-foreground shadow-2xl', className)}
    >
      {children}
    </div>,
    document.getElementById('nf-root') ?? document.body,
  )
}
