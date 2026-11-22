import { useEffect, useId, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import { Popover } from './popover'
import { timeLabel } from '@/pages/calendar/cal'
import { cn } from '@/lib/utils'

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))
const two = (n: number) => String(n).padStart(2, '0')

/** "930", "9:30", "09.30" and "0930" all mean 09:30. Returns '' when it is not a real time. */
export function parseTime(s: string): string {
  const m = /^\s*(\d{1,2})\s*[:.h]?\s*(\d{2})?\s*$/.exec(s) ?? /^\s*(\d)(\d{2})\s*$/.exec(s)
  if (!m) return ''
  const h = +m[1], mi = m[2] === undefined ? 0 : +m[2]
  return h <= 23 && mi <= 59 ? `${two(h)}:${two(mi)}` : ''
}

/**
 * A time field in 24-hour time. Pick an hour and a minute from the lists, or type a time (9:30, 0930) and press Enter.
 * Arrow keys move through a list, Left and Right switch lists, and Escape closes it.
 */
export function TimePicker({ value, onChange, id, placeholder = 'Time', clearable, disabled, className, 'aria-label': ariaLabel }: {
  value: string; onChange: (v: string) => void; id?: string; placeholder?: string; clearable?: boolean
  disabled?: boolean; className?: string; 'aria-label'?: string
}) {
  const btn = useRef<HTMLButtonElement>(null)
  const hours = useRef<HTMLDivElement>(null)
  const mins = useRef<HTMLDivElement>(null)
  const typed = useRef<HTMLInputElement>(null)
  const uid = useId()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [bad, setBad] = useState(false)
  const cur = /^\d{2}:\d{2}$/.test(value) ? value : ''
  const [h, m] = cur ? cur.split(':') : ['', '']

  const openIt = () => { if (disabled) return; setDraft(cur); setBad(false); setOpen(true) }
  const close = () => setOpen(false)

  // once the panel is shown: put the cursor in the typing box, and bring the chosen hour and minute into view
  useEffect(() => {
    if (!open) return
    const r = requestAnimationFrame(() => {
      typed.current?.focus({ preventScroll: true })
      for (const [col, v] of [[hours.current, h], [mins.current, m]] as const) {
        const el = v ? col?.querySelector<HTMLElement>(`[data-v="${v}"]`) : null
        if (col && el) col.scrollTop = el.offsetTop - col.clientHeight / 2 + el.clientHeight / 2
      }
    })
    return () => cancelAnimationFrame(r)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const setH = (hh: string) => { onChange(`${hh}:${m || '00'}`); setDraft(`${hh}:${m || '00'}`); setBad(false) }
  const setM = (mm: string) => { onChange(`${h || '09'}:${mm}`); close(); btn.current?.focus() }
  const commit = () => {
    if (!draft.trim()) { setBad(false); return true }
    const t = parseTime(draft)
    if (!t) { setBad(true); return false }
    setBad(false); setDraft(t); if (t !== cur) onChange(t)
    return true
  }

  const nav = (e: React.KeyboardEvent<HTMLElement>, col: 'h' | 'm') => {
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button'))
    const i = items.indexOf(document.activeElement as HTMLElement)
    const go = (n: number) => { e.preventDefault(); items[Math.min(items.length - 1, Math.max(0, n))]?.focus() }
    if (e.key === 'ArrowDown') go(i + 1)
    else if (e.key === 'ArrowUp') go(i - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(items.length - 1)
    else if ((e.key === 'ArrowRight' && col === 'h') || (e.key === 'ArrowLeft' && col === 'm')) {
      e.preventDefault()
      const other = (col === 'h' ? mins : hours).current
      ;(other?.querySelector<HTMLElement>('[aria-selected="true"]') ?? other?.querySelector<HTMLElement>('button'))?.focus()
    }
  }

  const item = (v: string, on: boolean, pick: () => void, tab: boolean) => (
    <button
      key={v}
      type="button"
      role="option"
      data-v={v}
      aria-selected={on}
      tabIndex={tab ? 0 : -1}
      onClick={pick}
      className={cn('grid h-8 w-full place-items-center rounded-md text-sm tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-ring', on ? 'bg-primary font-semibold text-primary-foreground hover:bg-primary/90' : 'hover:bg-secondary')}
    >
      {v}
    </button>
  )

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
          'flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-sm tabular-nums transition-colors',
          'hover:border-muted-foreground/60 focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50', open && 'border-ring', className,
        )}
      >
        <Clock aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className={cn('min-w-0 flex-1 truncate', !cur && 'text-muted-foreground')}>{cur || placeholder}</span>
      </button>

      <Popover anchor={btn} open={open} onClose={() => { commit(); close() }} role="dialog" label="Choose a time" className="w-56 p-3">
        <label className="sr-only" htmlFor={`${uid}-typed`}>Type a time</label>
        <input
          id={`${uid}-typed`}
          ref={typed}
          inputMode="numeric"
          autoComplete="off"
          placeholder="hh:mm"
          value={draft}
          maxLength={5}
          aria-invalid={bad}
          onChange={(e) => { setDraft(e.target.value); setBad(false) }}
          onBlur={() => { if (draft.trim() && !parseTime(draft)) setBad(true) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (commit()) { close(); btn.current?.focus() } } }}
          className={cn('h-9 w-full rounded-md border bg-background px-3 text-center text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-ring', bad ? 'border-destructive' : 'border-input')}
        />
        {bad ? <p role="alert" className="mt-1.5 text-xs text-destructive">Use 24-hour time, like 09:30 or 14:05.</p> : null}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <p className="mb-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Hour</p>
            <div ref={hours} role="listbox" aria-label="Hour" onKeyDown={(e) => nav(e, 'h')} className="relative h-44 space-y-0.5 overflow-y-auto overscroll-contain pr-1">
              {HOURS.map((v, i) => item(v, v === h, () => setH(v), h ? v === h : i === 0))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Minute</p>
            <div ref={mins} role="listbox" aria-label="Minute" onKeyDown={(e) => nav(e, 'm')} className="relative h-44 space-y-0.5 overflow-y-auto overscroll-contain pr-1">
              {MINUTES.map((v, i) => item(v, v === m, () => setM(v), MINUTES.includes(m) ? v === m : i === 0))}
            </div>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
          <button type="button" className="rounded-md px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-secondary" onClick={() => { onChange(timeLabel(new Date())); close(); btn.current?.focus() }}>Now</button>
          {clearable && cur ? <button type="button" className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground" onClick={() => { onChange(''); close(); btn.current?.focus() }}>Clear</button> : <span />}
        </div>
      </Popover>
    </>
  )
}
