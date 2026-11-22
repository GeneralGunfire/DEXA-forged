import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Popover } from './popover'
import { addDays, addMonths, monthLabel, monthStart, startOfWeek, todayKey, weekday, weekdayShort } from '@/pages/calendar/cal'
import { cn } from '@/lib/utils'

const utc = (k: string) => new Date(k + 'T00:00:00Z')
const show = (k: string) => new Intl.DateTimeFormat('en-ZA', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(utc(k))
const long = (k: string) => new Intl.DateTimeFormat('en-ZA', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(utc(k))
const MONTHS = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat('en-ZA', { timeZone: 'UTC', month: 'short' }).format(new Date(Date.UTC(2026, i, 1))))
/** Move by whole months and keep the day of the month where it exists (31 Jan + 1 month = 28 Feb). */
function shiftMonth(k: string, n: number) {
  const first = addMonths(k, n)
  const [y, m] = first.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${first.slice(0, 8)}${String(Math.min(+k.slice(8), last)).padStart(2, '0')}`
}
const isKey = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)

/**
 * A date field with its own calendar. Click a day, or use the arrow keys, Home/End, PageUp/PageDown
 * (Shift for a year) and Enter. Click the month name to jump to another month or year. Dates are plain
 * YYYY-MM-DD, and "today" is Johannesburg's today.
 */
export function DatePicker({ value, onChange, id, placeholder = 'Choose a date', clearable, min, max, disabled, className, 'aria-label': ariaLabel }: {
  value: string; onChange: (v: string) => void; id?: string; placeholder?: string; clearable?: boolean
  min?: string; max?: string; disabled?: boolean; className?: string; 'aria-label'?: string
}) {
  const btn = useRef<HTMLButtonElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'days' | 'months'>('days')
  const [view, setView] = useState(monthStart(todayKey()))
  const [focus, setFocus] = useState(todayKey())
  const today = todayKey()
  const sel = isKey(value) ? value : ''
  const ok = (k: string) => (!min || k >= min) && (!max || k <= max)

  const openIt = () => {
    if (disabled) return
    let f = sel || today
    if (!ok(f)) f = min && f < min ? min : max ?? f
    setFocus(f); setView(monthStart(f)); setMode('days'); setOpen(true)
  }
  const close = () => setOpen(false)
  const choose = (k: string) => { if (!ok(k)) return; onChange(k); close(); btn.current?.focus() }

  // keep keyboard focus on the day that is "current"
  useEffect(() => {
    if (!open || mode !== 'days') return
    const r = requestAnimationFrame(() => grid.current?.querySelector<HTMLElement>(`[data-key="${focus}"]`)?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(r)
  }, [open, mode, focus, view])

  const onGridKey = (e: React.KeyboardEvent) => {
    let n = focus
    switch (e.key) {
      case 'ArrowLeft': n = addDays(focus, -1); break
      case 'ArrowRight': n = addDays(focus, 1); break
      case 'ArrowUp': n = addDays(focus, -7); break
      case 'ArrowDown': n = addDays(focus, 7); break
      case 'Home': n = addDays(focus, -weekday(focus)); break
      case 'End': n = addDays(focus, 6 - weekday(focus)); break
      case 'PageUp': n = shiftMonth(focus, e.shiftKey ? -12 : -1); break
      case 'PageDown': n = shiftMonth(focus, e.shiftKey ? 12 : 1); break
      default: return
    }
    e.preventDefault()
    if (!ok(n)) return
    setFocus(n); setView(monthStart(n))
  }

  const first = startOfWeek(view)
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i)) // six rows, so the panel never changes height
  const year = +view.slice(0, 4)
  const cell = 'grid size-9 place-items-center rounded-md text-sm tabular-nums transition-colors'

  return (
    <>
      <button
        ref={btn}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close() : openIt())}
        onKeyDown={(e) => { if (!open && e.key === 'ArrowDown') { e.preventDefault(); openIt() } }}
        className={cn(
          'flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-sm transition-colors',
          'hover:border-muted-foreground/60 focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50', open && 'border-ring', className,
        )}
      >
        <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className={cn('min-w-0 flex-1 truncate', !sel && 'text-muted-foreground')}>{sel ? show(sel) : placeholder}</span>
      </button>

      <Popover anchor={btn} open={open} onClose={close} role="dialog" label="Choose a date" className="w-[19.5rem] p-3">
        <div className="mb-2 flex items-center justify-between gap-1">
          <button type="button" aria-label={mode === 'days' ? 'Previous month' : 'Previous year'} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
            onClick={() => (mode === 'days' ? setView(addMonths(view, -1)) : setView(`${year - 1}-${view.slice(5)}`))}><ChevronLeft className="size-4" aria-hidden="true" /></button>
          <button type="button" aria-live="polite" onClick={() => setMode(mode === 'days' ? 'months' : 'days')}
            className="rounded-md px-2.5 py-1.5 text-sm font-semibold hover:bg-secondary">{mode === 'days' ? monthLabel(view) : year}</button>
          <button type="button" aria-label={mode === 'days' ? 'Next month' : 'Next year'} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
            onClick={() => (mode === 'days' ? setView(addMonths(view, 1)) : setView(`${year + 1}-${view.slice(5)}`))}><ChevronRight className="size-4" aria-hidden="true" /></button>
        </div>

        {mode === 'months' ? (
          <div className="grid grid-cols-3 gap-1.5 py-1" role="listbox" aria-label="Month">
            {MONTHS.map((m, i) => {
              const key = `${year}-${String(i + 1).padStart(2, '0')}-01`
              const here = key.slice(0, 7) === view.slice(0, 7)
              return (
                <button key={m} type="button" role="option" aria-selected={here} onClick={() => { setView(key); setFocus(key); setMode('days') }}
                  className={cn('h-11 rounded-md text-sm font-medium hover:bg-secondary', here && 'bg-primary text-primary-foreground hover:bg-primary/90', key.slice(0, 7) === today.slice(0, 7) && !here && 'text-primary')}>{m}</button>
              )
            })}
          </div>
        ) : (
          <div ref={grid} role="grid" aria-label={monthLabel(view)} onKeyDown={onGridKey}>
            <div className="grid grid-cols-7 pb-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground" role="row">
              {days.slice(0, 7).map((d) => <span key={d} role="columnheader" className="grid h-7 place-items-center">{weekdayShort(d).slice(0, 2)}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-y-0.5" role="rowgroup">
              {days.map((d) => {
                const inMonth = d.slice(0, 7) === view.slice(0, 7)
                const on = d === sel
                return (
                  <button
                    key={d}
                    type="button"
                    role="gridcell"
                    data-key={d}
                    tabIndex={d === focus ? 0 : -1}
                    aria-selected={on}
                    aria-current={d === today ? 'date' : undefined}
                    aria-label={long(d)}
                    disabled={!ok(d)}
                    onClick={() => choose(d)}
                    className={cn(
                      cell, 'focus-visible:outline-2 focus-visible:outline-ring',
                      on ? 'bg-primary font-semibold text-primary-foreground hover:bg-primary/90'
                        : cn('hover:bg-secondary', inMonth ? 'text-foreground' : 'text-muted-foreground/50', d === today && 'border border-primary text-primary'),
                      !ok(d) && 'cursor-not-allowed opacity-30 hover:bg-transparent',
                    )}
                  >
                    {+d.slice(8)}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
          <button type="button" className="rounded-md px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-secondary" onClick={() => (ok(today) ? choose(today) : setView(monthStart(today)))}>Today</button>
          {clearable && sel ? <button type="button" className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground" onClick={() => { onChange(''); close(); btn.current?.focus() }}>Clear</button> : <span />}
        </div>
      </Popover>
    </>
  )
}
