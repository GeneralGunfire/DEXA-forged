import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A checkbox. The real input stays in the page (for keyboard, screen readers and forms) but is hidden;
 * the box you see reacts to it. Clicking the box or its label toggles it.
 */
export function Checkbox({ checked, onChange, children, disabled, id, className, boxClassName, 'aria-label': ariaLabel }: {
  checked: boolean; onChange: (v: boolean) => void; children?: ReactNode; disabled?: boolean; id?: string
  className?: string; boxClassName?: string; 'aria-label'?: string
}) {
  return (
    <label className={cn('group inline-flex items-start gap-2.5 text-sm', disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer', className)}>
      <input
        id={id}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className={cn(
          'mt-px grid size-[18px] shrink-0 place-items-center rounded-[5px] border border-input bg-background text-primary-foreground transition-colors',
          'group-hover:border-muted-foreground peer-checked:border-primary peer-checked:bg-primary',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring',
          '[&>svg]:scale-50 [&>svg]:opacity-0 [&>svg]:transition peer-checked:[&>svg]:scale-100 peer-checked:[&>svg]:opacity-100',
          boxClassName,
        )}
      >
        <Check className="size-3.5" strokeWidth={3} />
      </span>
      {children ? <span className="min-w-0 flex-1 select-none leading-[18px]">{children}</span> : null}
    </label>
  )
}
