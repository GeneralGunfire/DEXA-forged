import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Popover } from './popover'
import { cn } from '@/lib/utils'

export type Option<T extends string = string> = { value: T; label: string; hint?: string; disabled?: boolean }

/**
 * A select box: a button that opens a list. Arrow keys, Home/End, Enter/Space, Escape and type-ahead all work,
 * the list flips above when there is no room below, and it never gets clipped by a dialog.
 */
export function Select<T extends string>({ value, onChange, options, placeholder = 'Select…', id, disabled, className, 'aria-label': ariaLabel }: {
  value: T | ''; onChange: (v: T) => void; options: Option<T>[]; placeholder?: string; id?: string
  disabled?: boolean; className?: string; 'aria-label'?: string
}) {
  const btn = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const typed = useRef({ s: '', t: 0 })
  const selected = options.findIndex((o) => o.value === value)
  const enabled = useMemo(() => options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0), [options])

  const show = (to?: number) => {
    if (disabled || !enabled.length) return
    setActive(to ?? (selected >= 0 ? selected : enabled[0]))
    setOpen(true)
  }
  const close = () => setOpen(false)
  const pick = (i: number) => { const o = options[i]; if (!o || o.disabled) return; onChange(o.value); close(); btn.current?.focus() }
  const move = (d: number) => {
    const at = enabled.indexOf(active)
    setActive(enabled[Math.min(enabled.length - 1, Math.max(0, (at < 0 ? 0 : at) + d))])
  }

  useEffect(() => { if (open) list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }) }, [open, active])

  const onKey = (e: React.KeyboardEvent) => {
    if (disabled) return
    const k = e.key
    if (k === 'Tab') return
    if (!open) {
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') { e.preventDefault(); show() }
      else if (k === 'Home') { e.preventDefault(); show(enabled[0]) }
      else if (k === 'End') { e.preventDefault(); show(enabled[enabled.length - 1]) }
      else if (k.length === 1 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); show(); jump(k) }
      return
    }
    if (k === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (k === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (k === 'Home') { e.preventDefault(); setActive(enabled[0]) }
    else if (k === 'End') { e.preventDefault(); setActive(enabled[enabled.length - 1]) }
    else if (k === 'PageDown') { e.preventDefault(); move(5) }
    else if (k === 'PageUp') { e.preventDefault(); move(-5) }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); pick(active) }
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); jump(k) }
  }
  // type-ahead: typing "hu" jumps to the first option starting with "hu"
  function jump(ch: string) {
    const now = Date.now()
    const t = typed.current
    t.s = now - t.t > 700 ? ch.toLowerCase() : t.s + ch.toLowerCase()
    t.t = now
    const hit = enabled.find((i) => options[i].label.toLowerCase().startsWith(t.s))
    if (hit !== undefined) setActive(hit)
  }

  const current = selected >= 0 ? options[selected] : null
  return (
    <>
      <button
        ref={btn}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={onKey}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm text-foreground transition-colors',
          'hover:border-muted-foreground/60 focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50',
          open && 'border-ring',
          className,
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate', !current && 'text-muted-foreground')}>{current ? current.label : placeholder}</span>
        <ChevronDown aria-hidden="true" className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      <Popover anchor={btn} open={open} onClose={close} matchWidth keepFocus className="p-1">
        <ul ref={list} id={listId} role="listbox" aria-label={ariaLabel} className="space-y-0.5">
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === selected}
              aria-disabled={o.disabled || undefined}
              data-active={i === active}
              onMouseMove={() => { if (!o.disabled && active !== i) setActive(i) }}
              onClick={() => pick(i)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm',
                i === active && 'bg-secondary', o.disabled && 'cursor-not-allowed opacity-40',
              )}
            >
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.hint ? <span className="shrink-0 text-xs text-muted-foreground">{o.hint}</span> : null}
              <Check aria-hidden="true" className={cn('size-4 shrink-0 text-primary', i === selected ? 'opacity-100' : 'opacity-0')} />
            </li>
          ))}
          {options.length === 0 ? <li className="px-2.5 py-2 text-sm text-muted-foreground">No options</li> : null}
        </ul>
      </Popover>
    </>
  )
}
