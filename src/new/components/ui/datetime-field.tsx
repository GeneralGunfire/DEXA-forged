import { DatePicker } from './date-picker'
import { TimePicker } from './time-picker'
import { todayKey } from '@/pages/calendar/cal'

/** A date and a time side by side. The value is "YYYY-MM-DDTHH:mm" (Johannesburg time), or "" when empty. */
export function DateTimeField({ value, onChange, clearable, id, label, defaultTime = '09:00' }: {
  value: string; onChange: (v: string) => void; clearable?: boolean; id?: string; label: string; defaultTime?: string
}) {
  const [d, t] = value ? value.split('T') : ['', '']
  return (
    <div className="flex gap-2">
      <div className="min-w-0 flex-1">
        <DatePicker id={id} aria-label={`${label}, date`} clearable={clearable} value={d} onChange={(nd) => onChange(nd ? `${nd}T${t || defaultTime}` : '')} />
      </div>
      <div className="w-[7.5rem] shrink-0">
        <TimePicker aria-label={`${label}, time`} clearable={clearable} value={t ?? ''} onChange={(nt) => onChange(nt ? `${d || todayKey()}T${nt}` : '')} />
      </div>
    </div>
  )
}
