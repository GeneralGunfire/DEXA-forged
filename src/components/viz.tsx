import type { ReactNode } from 'react'

/** A circular score, 0 to 100. Neutral ink: a low score is information, not an alarm. */
export function ScoreRing({ pct, size = 56, label }: { pct: number; size?: number; label?: ReactNode }) {
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  const color = '#0b0d12'
  return (
    <span className="ring" style={{ width: size, height: size }} role="img" aria-label={`${pct} percent complete`}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e3eaf6" strokeWidth="5" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.2,.7,.2,1)' }}
        />
      </svg>
      <b>{label ?? `${pct}%`}</b>
    </span>
  )
}

/** Five stars, filled to the rating. Read-only. */
export function Stars({ value, size = 16 }: { value: number | null; size?: number }) {
  if (value == null) return <span className="muted">No rating</span>
  return (
    <span className="stars" role="img" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className={n <= value ? 'on' : ''}>
          <path d="M12 3.2l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.2l-5.4 2.9 1-6.1L3.2 9.7l6.1-.9z" />
        </svg>
      ))}
    </span>
  )
}

/** A labelled horizontal bar, width as a share of `max`. */
export function Bar({ label, value, max, tone, right }: { label: ReactNode; value: number; max: number; tone?: 'good' | 'warn' | 'bad' | 'ink'; right?: ReactNode }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return (
    <div className="hbar">
      <span className="hbar__label">{label}</span>
      <span className="hbar__track"><i className={tone ? `is-${tone}` : ''} style={{ width: `${value > 0 ? pct : 0}%` }} /></span>
      <span className="hbar__val">{right ?? value}</span>
    </div>
  )
}
