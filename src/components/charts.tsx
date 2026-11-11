import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import '../pages/app/charts.css'

/* The visual language of the DEXA source documents: navy ink, one bright blue, plain bars,
   "at a glance" tiles, before-and-after meters and a blue "in plain words" callout.
   Magnitude is always one blue ramp (light to dark), so no categorical palette is needed.
   Every mark has a text label, a tooltip and an aria-label, so nothing relies on colour alone. */

/* ---------- at a glance ---------- */

export function StatTiles({ items }: { items: { value: ReactNode; label: string; hint?: string; alert?: boolean }[] }) {
  return (
    <div className="gl" role="list">
      {items.map((t) => (
        <div className={`gl__t${t.alert ? ' is-alert' : ''}`} role="listitem" key={t.label}>
          <strong>{t.value}</strong>
          <span>{t.label}</span>
          {t.hint && <small>{t.hint}</small>}
        </div>
      ))}
    </div>
  )
}

/* ---------- horizontal bars (a distribution, ranked) ---------- */

export type BarItem = { label: ReactNode; value: number; note?: string; to?: string; text?: string }

export function BarList({ items, max, unit = '', ariaLabel, track }: { items: BarItem[]; max?: number; unit?: string; ariaLabel?: string; track?: boolean }) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value))
  return (
    <ul className={`bl${track ? ' bl--track' : ''}`} aria-label={ariaLabel}>
      {items.map((i, k) => (
        <li key={k} title={`${typeof i.label === 'string' ? i.label : ''} ${i.value}${unit}`.trim()}>
          <span className="bl__l">{i.to ? <Link to={i.to}>{i.label}</Link> : i.label}{i.note && <small>{i.note}</small>}</span>
          <span className="bl__t"><i style={{ width: `${Math.max(i.value > 0 ? 1.5 : 0, (i.value / top) * 100)}%` }} /></span>
          <b className="bl__v">{i.text ?? `${i.value.toLocaleString('en-ZA')}${unit}`}</b>
        </li>
      ))}
    </ul>
  )
}

/* ---------- one bar split into ordered parts (for example a medicine schedule S0 to S6) ---------- */

const RAMP = ['#111827', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#f3f4f6']

export function Stacked({ segments }: { segments: { label: string; value: number }[] }) {
  const parts = segments.filter((s) => s.value > 0)
  const total = parts.reduce((a, b) => a + b.value, 0) || 1
  const colour = (i: number) => RAMP[parts.length <= 1 ? 2 : Math.round((i * (RAMP.length - 1)) / (parts.length - 1))]
  return (
    <div className="st">
      <div className="st__bar" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
        {parts.map((p, i) => <span key={p.label} style={{ flexGrow: p.value, background: colour(i) }} title={`${p.label}: ${p.value} (${Math.round((p.value / total) * 100)}%)`} />)}
      </div>
      <ul className="st__key">
        {parts.map((p, i) => <li key={p.label}><i style={{ background: colour(i) }} />{p.label}<b>{p.value.toLocaleString('en-ZA')}</b></li>)}
      </ul>
    </div>
  )
}

/* ---------- before and after (0% to 29%) ---------- */

export function BeforeAfter({ label, before, after, unit = '%' }: { label: ReactNode; before: number; after: number; unit?: string }) {
  const top = Math.max(100, before, after)
  return (
    <div className="ba" role="img" aria-label={`${typeof label === 'string' ? label : 'Change'}: from ${before}${unit} to ${after}${unit}`}>
      <span className="ba__l">{label}</span>
      <span className="ba__t">
        <i className="ba__after" style={{ width: `${(after / top) * 100}%` }} />
        <u style={{ left: `${(before / top) * 100}%` }} aria-hidden="true" />
      </span>
      <b className="ba__v">{before}{unit} <span aria-hidden="true">→</span> {after}{unit}</b>
    </div>
  )
}

/* ---------- a plain meter: 5 of 6 ---------- */

export function Meter({ label, value, of, hint }: { label: string; value: number; of: number; hint?: string }) {
  const pct = of > 0 ? Math.round((value / of) * 100) : 0
  return (
    <div className="mt" role="img" aria-label={`${label}: ${value} of ${of}`}>
      <span className="mt__l">{label}{hint && <small>{hint}</small>}</span>
      <span className="mt__t"><i style={{ width: `${pct}%` }} /></span>
      <b className="mt__v">{value} of {of}</b>
    </div>
  )
}

/* ---------- columns over time (click a column to jump) ---------- */

export type Col = { key: string; label: string; value: number; tip?: string }

export function Columns({ data, activeKey, onSelect, height = 84, ariaLabel }: {
  data: Col[]; activeKey?: string; onSelect?: (key: string) => void; height?: number; ariaLabel?: string
}) {
  const top = Math.max(1, ...data.map((d) => d.value))
  return (
    <figure className="co" aria-label={ariaLabel}>
      <div className="co__plot" style={{ height }}>
        <span className="co__max" aria-hidden="true">{top}</span>
        {data.map((d) => {
          const tip = d.tip ?? `${d.label}: ${d.value}`
          const bar = <i style={{ height: `${Math.max(d.value > 0 ? 4 : 0, (d.value / top) * 100)}%` }} />
          return onSelect ? (
            <button type="button" key={d.key} className={`co__c${d.key === activeKey ? ' is-on' : ''}`} data-tip={tip} aria-label={tip} onClick={() => onSelect(d.key)}>{bar}</button>
          ) : (
            <span key={d.key} className="co__c" data-tip={tip} role="img" aria-label={tip}>{bar}</span>
          )
        })}
      </div>
      {data.length > 1 && (
        <figcaption className="co__x"><span>{data[0].label}</span><span>{data[data.length - 1].label}</span></figcaption>
      )}
    </figure>
  )
}

/* ---------- callouts and takeaways ---------- */

export function Callout({ label = 'In plain words', children }: { label?: string; children: ReactNode }) {
  return <aside className="callout"><b>{label}</b><div>{children}</div></aside>
}

export function Takeaways({ title = 'Key takeaways', items }: { title?: string; items: string[] }) {
  return (
    <section className="tk">
      <h3>{title}</h3>
      <ul>{items.map((t) => <li key={t}>{t}</li>)}</ul>
    </section>
  )
}

/* ---------- the flowing line motif from the document covers ---------- */

const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t)
const wave = Array.from({ length: 16 }, (_, i) => {
  const t = i / 15
  const y0 = 8 + i * 2.4
  const amp = 6 + t * 10
  let d = ''
  for (let x = 0; x <= 1200; x += 20) d += `${x === 0 ? 'M' : 'L'}${x} ${(y0 + amp * Math.sin(x / 190 + i * 0.28)).toFixed(1)}`
  return { d, stroke: `rgb(${lerp(209, 17, t)},${lerp(213, 24, t)},${lerp(219, 39, t)})` }
})

export function WaveBand({ tone = 'navy', drift = false, className = '' }: { tone?: 'navy' | 'light'; drift?: boolean; className?: string }) {
  return (
    <svg className={`wave wave--${tone}${drift ? ' wave--drift' : ''} ${className}`} viewBox="0 0 1200 64" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <g>{wave.map((w, i) => <path key={i} d={w.d} stroke={tone === 'light' ? `rgba(255,255,255,${(0.18 + (i / 15) * 0.5).toFixed(2)})` : w.stroke} fill="none" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}</g>
    </svg>
  )
}

/* ---------- a chart written as content (content-write kind "chart") ---------- */

export type ChartSpec = {
  type: 'bar' | 'stacked' | 'before-after'
  unit?: string
  items: { label: string; value?: number; before?: number; after?: number }[]
}

export function ChartBlock({ body }: { body: string }) {
  let spec: ChartSpec
  try { spec = JSON.parse(body) as ChartSpec } catch { return <p className="muted">This chart could not be shown.</p> }
  if (!spec || !Array.isArray(spec.items)) return <p className="muted">This chart could not be shown.</p>
  if (spec.type === 'stacked') return <Stacked segments={spec.items.map((i) => ({ label: i.label, value: i.value ?? 0 }))} />
  if (spec.type === 'before-after') {
    return <div className="ba-list">{spec.items.map((i) => <BeforeAfter key={i.label} label={i.label} before={i.before ?? 0} after={i.after ?? 0} unit={spec.unit ?? '%'} />)}</div>
  }
  return <BarList items={spec.items.map((i) => ({ label: i.label, value: i.value ?? 0 }))} unit={spec.unit ?? ''} />
}
