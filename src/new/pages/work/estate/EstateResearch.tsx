import { useMemo, useState } from 'react'
import { ChevronRight, Pencil, Plus, Search, TriangleAlert, X } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import { unwrap } from '../../../../lib/data'
import { btn, btnGhost, dateTimeLabel, field, label } from '../../calendar/cal'
import { ago } from '../../databases/shared'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Empty, FormDialog, RefusalHint } from '../FormDialog'
import {
  CONFIDENCE, CONFIDENCE_LABEL, filterSections, parseSources, topicLabel, topicStats, TOPICS,
  type EstateConfidence, type EstateSection, type Topic,
} from './EstateShared'

const BADGE: Record<EstateConfidence, string> = {
  confirmed: 'border-border bg-secondary text-foreground',
  partly: 'border-primary/50 bg-primary/10 text-foreground',
  not_established: 'border-destructive bg-destructive/15 font-semibold text-destructive',
}
const DOT: Record<EstateConfidence, string> = { confirmed: 'bg-muted-foreground/60', partly: 'bg-primary', not_established: 'bg-destructive' }

/** A confidence badge. "Not established" is deliberately loud (red, bold, with a warning sign) so an unknown is never read as a fact. */
export function ConfidenceBadge({ c, className }: { c: EstateConfidence; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium leading-5', BADGE[c], className)}>
      {c === 'not_established' ? <TriangleAlert className="size-3" aria-hidden="true" /> : null}{CONFIDENCE_LABEL[c]}
    </span>
  )
}

/** Sources as plain lines. Only http and https addresses become links (new tab, no opener); everything else is printed as text. */
export function Sources({ text }: { text: string }) {
  const lines = parseSources(text)
  if (lines.length === 0) return <p className="text-sm text-muted-foreground">No sources listed.</p>
  return (
    <ul className="space-y-1">
      {lines.map((parts, i) => (
        <li key={i} className="break-words text-sm leading-6 text-foreground/90">
          {parts.map((p, j) => p.href
            ? <a key={j} href={p.href} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline-offset-2 hover:underline">{p.text}</a>
            : <span key={j}>{p.text}</span>)}
        </li>
      ))}
    </ul>
  )
}

export function EstateResearch({ sections, reload }: { sections: EstateSection[]; reload: () => void }) {
  // start on the first topic that has something in it
  const [topic, setTopic] = useState<Topic>(() => TOPICS.find((t) => sections.some((s) => s.topic === t.value))?.value ?? 'requirements')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<{ section?: EstateSection; topic?: Topic } | null>(null)

  const stats = useMemo(() => topicStats(sections), [sections])
  const shown = useMemo(() => filterSections(sections, { topic, q }), [sections, topic, q])
  const searching = q.trim() !== ''
  const toggle = (id: string) => setOpen((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set(s).add(id)))

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 max-w-md flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input type="search" className={cn(field, 'h-9 pl-9 pr-8')} placeholder="Search every topic (title and text)" aria-label="Search the research" value={q} onChange={(e) => setQ(e.target.value)} />
          {q ? <button type="button" aria-label="Clear the search" onClick={() => setQ('')} className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="size-3.5" aria-hidden="true" /></button> : null}
        </div>
        <button type="button" className={cn(btn, 'ml-auto')} onClick={() => setEditing({ topic })}><Plus className="size-4" aria-hidden="true" /> Add section</button>
      </div>

      <div className="mt-6 grid gap-8 md:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label="Topics">
          <ul className="space-y-0.5">
            {TOPICS.map((t) => {
              const st = stats[t.value]
              const on = !searching && topic === t.value
              return (
                <li key={t.value}>
                  <button type="button" aria-current={on ? 'true' : undefined} onClick={() => { setTopic(t.value); setQ('') }}
                    className={cn('flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring', on ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground')}>
                    <span className="min-w-0 flex-1 truncate">{t.label}</span>
                    {st ? (
                      <>
                        <span className="tabular-nums text-xs">{st.count}</span>
                        <span role="img" aria-label={`Weakest: ${CONFIDENCE_LABEL[st.weakest]}`} title={`Weakest: ${CONFIDENCE_LABEL[st.weakest]}`}
                          className={cn('shrink-0 rounded-full', st.weakest === 'not_established' ? 'size-2.5 ring-2 ring-destructive/40' : 'size-2', DOT[st.weakest])} />
                      </>
                    ) : <span className="text-xs">0</span>}
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="mt-3 px-3 text-[11px] leading-4 text-muted-foreground">The dot shows the weakest confidence in the topic.</p>
        </nav>

        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">
            {searching ? `Search results` : topicLabel(topic)}
            <span className="ml-3 text-xs font-normal tabular-nums text-muted-foreground">{shown.length} {shown.length === 1 ? 'section' : 'sections'}</span>
          </h2>
          {searching ? <p className="mt-1 text-sm text-muted-foreground">Searching every topic for “{q.trim()}”. Clear the search to go back to a topic.</p> : null}

          <div className="mt-4">
            {shown.length === 0 ? (
              <Empty>{searching ? 'No section matches that search.' : 'No sections in this topic yet.'}{!searching ? <> <button type="button" className="text-primary hover:underline" onClick={() => setEditing({ topic })}>Add one</button></> : null}</Empty>
            ) : (
              <ul className="space-y-3">
                {shown.map((s) => {
                  const isOpen = open.has(s.id)
                  const unknown = s.confidence === 'not_established'
                  return (
                    <li key={s.id} className={cn('rounded-xl border', unknown ? 'border-destructive/60 bg-destructive/[0.06]' : 'border-border')}>
                      <button type="button" aria-expanded={isOpen} onClick={() => toggle(s.id)} className="flex w-full items-start gap-3 rounded-xl px-4 py-3.5 text-left transition-colors hover:bg-secondary/30 focus-visible:outline-2 focus-visible:outline-ring">
                        <ChevronRight aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-90')} />
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-sm font-semibold leading-snug">{s.title}</span>
                          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                            <ConfidenceBadge c={s.confidence} />
                            {searching ? <span className="rounded-full border border-border px-2 leading-5">{topicLabel(s.topic)}</span> : null}
                            <span title={dateTimeLabel(s.updated_at)}>Edited {ago(s.updated_at)}</span>
                          </span>
                        </span>
                      </button>
                      {isOpen ? (
                        <div className="space-y-4 border-t border-border/60 px-4 pb-4 pt-3 sm:pl-11">
                          {unknown ? <p className="text-sm font-medium text-destructive">Not established: treat this as unknown, not as a fact.</p> : null}
                          {s.body ? <p className="max-w-[72ch] whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">{s.body}</p> : <p className="text-sm text-muted-foreground">No text yet.</p>}
                          <div>
                            <h3 className={cn(label, '!mb-1.5')}>Sources</h3>
                            <Sources text={s.sources} />
                          </div>
                          <div className="flex justify-end"><button type="button" className={cn(btnGhost, '!h-8 !px-2.5')} onClick={() => setEditing({ section: s })}><Pencil className="size-3.5" aria-hidden="true" /> Edit</button></div>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {editing ? (
        <SectionForm
          section={editing.section} start={editing.topic ?? topic} next={Math.max(0, ...sections.map((s) => s.position)) + 1}
          onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload() }}
        />
      ) : null}
    </div>
  )
}

function SectionForm({ section, start, next, onClose, onDone }: { section?: EstateSection; start: Topic; next: number; onClose: () => void; onDone: () => void }) {
  const [topic, setTopic] = useState<Topic>(section?.topic ?? start)
  const [title, setTitle] = useState(section?.title ?? '')
  const [confidence, setConfidence] = useState<EstateConfidence>(section?.confidence ?? 'not_established')
  const [body, setBody] = useState(section?.body ?? '')
  const [sources, setSources] = useState(section?.sources ?? '')
  return (
    <FormDialog
      title={section ? 'Edit section' : 'New section'} size="lg" saveLabel={section ? 'Save changes' : 'Add section'}
      check={{ title, body, sources }} onClose={onClose}
      onSave={async () => {
        if (!title.trim()) throw new Error('Give the section a title.')
        const row = { topic, title: title.trim(), body: body.trim(), confidence, sources: sources.trim() }
        if (section) unwrap(await supabase.from('gw_estate_sections').update(row).eq('id', section.id))
        else unwrap(await supabase.from('gw_estate_sections').insert({ ...row, position: next }))
        onDone()
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div><label className={label} htmlFor="es-topic">Topic</label><Select id="es-topic" value={topic} onChange={(v) => setTopic(v as Topic)} options={TOPICS.map((t) => ({ value: t.value, label: t.label }))} /></div>
        <div><label className={label} htmlFor="es-conf">How sure are we</label><Select id="es-conf" value={confidence} onChange={(v) => setConfidence(v as EstateConfidence)} options={[...CONFIDENCE].reverse().map((c) => ({ value: c, label: CONFIDENCE_LABEL[c] }))} /></div>
      </div>
      <div><label className={label} htmlFor="es-title">Title</label><input id="es-title" data-autofocus className={field} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></div>
      <div><label className={label} htmlFor="es-body">Text</label><textarea id="es-body" className={cn(field, 'min-h-48 resize-y')} value={body} maxLength={60000} onChange={(e) => setBody(e.target.value)} /></div>
      <div>
        <label className={label} htmlFor="es-src">Sources</label>
        <textarea id="es-src" className={cn(field, 'min-h-24 resize-y')} value={sources} maxLength={5000} onChange={(e) => setSources(e.target.value)} />
        <p className="mt-1.5 text-xs text-muted-foreground">One source per line: a title, a web address, or both. Web addresses starting with http:// or https:// become links.</p>
      </div>
      <RefusalHint />
    </FormDialog>
  )
}
