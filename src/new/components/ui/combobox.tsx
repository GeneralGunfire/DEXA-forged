import { useId, useMemo, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { Popover } from './popover'
import { cn } from '@/lib/utils'

/** A text box with a list of suggestions. You can pick one or type your own. */
export function Combobox({ value, onChange, options, id, placeholder, maxLength, className, 'aria-label': ariaLabel }: {
  value: string; onChange: (v: string) => void; options: string[]; id?: string; placeholder?: string
  maxLength?: number; className?: string; 'aria-label'?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const shown = useMemo(() => {
    const q = value.trim().toLowerCase()
    return q && !options.some((o) => o.toLowerCase() === q) ? options.filter((o) => o.toLowerCase().includes(q)) : options
  }, [value, options])

  const pick = (o: string) => { onChange(o); setOpen(false); setActive(-1); input.current?.focus() }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(shown.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    else if (e.key === 'Enter' && open && active >= 0 && shown[active]) { e.preventDefault(); pick(shown[active]) }
  }

  return (
    <>
      <input
        ref={input}
        id={id}
        role="combobox"
        aria-expanded={open && shown.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        autoComplete="off"
        placeholder={placeholder}
        maxLength={maxLength}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1) }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={onKey}
        className={cn('h-9 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring', className)}
      />
      <Popover anchor={input} open={open && shown.length > 0} onClose={() => setOpen(false)} matchWidth keepFocus className="p-1">
        <ul id={listId} role="listbox" className="space-y-0.5">
          {shown.map((o, i) => (
            <li
              key={o}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o === value}
              onMouseMove={() => setActive(i)}
              onClick={() => pick(o)}
              className={cn('flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm', i === active && 'bg-secondary')}
            >
              <span className="min-w-0 flex-1 truncate">{o}</span>
              <Check aria-hidden="true" className={cn('size-4 text-primary', o === value ? 'opacity-100' : 'opacity-0')} />
            </li>
          ))}
        </ul>
      </Popover>
    </>
  )
}
