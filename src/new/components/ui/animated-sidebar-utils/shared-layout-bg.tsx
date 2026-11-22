'use client'

import { motion, useReducedMotion } from 'motion/react'
import {
  createElement,
  forwardRef,
  useCallback,
  useRef,
  useState,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/utils'
import { SPRING_LAYOUT } from './ease'

export interface SharedLayoutBgProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType
  /** Pixels the highlight is pulled in from each side of the list. */
  inset?: number
  pillClassName?: string
  pillContainerClassName?: string
  children?: ReactNode
}

/**
 * A list wrapper with one highlight that glides between the item under the pointer or keyboard focus,
 * instead of every item painting its own hover background. Items are the direct children marked
 * `data-slot="sidebar-menu-item"`.
 */
export const SharedLayoutBg = forwardRef<HTMLElement, SharedLayoutBgProps>(function SharedLayoutBg(
  { as = 'div', inset = 0, pillClassName, pillContainerClassName, className, children, onPointerLeave, onBlur, ...props },
  forwardedRef,
) {
  const reduce = useReducedMotion() ?? false
  const listRef = useRef<HTMLElement | null>(null)
  const [pill, setPill] = useState<{ y: number } | null>(null)

  const track = useCallback((target: EventTarget | null) => {
    const item = (target as HTMLElement | null)?.closest<HTMLElement>('[data-slot="sidebar-menu-item"]')
    if (!item || !listRef.current?.contains(item)) return
    setPill({ y: item.offsetTop })
  }, [])

  return createElement(
    as,
    {
      ...props,
      ref: (node: HTMLElement | null) => {
        listRef.current = node
        if (typeof forwardedRef === 'function') forwardedRef(node)
        else if (forwardedRef) forwardedRef.current = node
      },
      className: cn('relative', className),
      onPointerOver: (e: React.PointerEvent<HTMLElement>) => track(e.target),
      onFocus: (e: React.FocusEvent<HTMLElement>) => track(e.target),
      onPointerLeave: (e: React.PointerEvent<HTMLElement>) => { setPill(null); onPointerLeave?.(e) },
      onBlur: (e: React.FocusEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPill(null)
        onBlur?.(e)
      },
    },
    <span
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-y-0 z-0', pillContainerClassName)}
      style={{ left: inset, right: inset }}
    >
      <motion.span
        initial={false}
        animate={{ y: pill?.y ?? 0, opacity: pill ? 1 : 0 }}
        transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
        className={cn('absolute inset-0', pillClassName)}
      />
    </span>,
    children,
  )
})
