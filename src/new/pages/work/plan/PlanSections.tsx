import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import { unwrap } from '../../../../lib/data'
import { btn, btnGhost, field, label } from '../../calendar/cal'
import { ago } from '../../databases/shared'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Empty, FormDialog, Part } from '../FormDialog'
import { SECTION_KINDS, SECTION_LABEL, type PlanSection, type SectionKind } from '../shared'

export function PlanSections({ dbId, sections, reload }: { dbId: string; sections: PlanSection[]; reload: () => void }) {
  const [editing, setEditing] = useState<PlanSection | 'new' | null>(null)
  const list = [...sections].sort((a, b) => a.position - b.position)
  return (
    <Part
      id="sections" title="Sections" count={list.length} hint="In-depth notes on this database. Both of us and the Claude chat write here."
      action={<button type="button" className={btn} onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden="true" /> Add section</button>}
    >
      {list.length === 0 ? <Empty>No sections yet. Add the background, the connection route or the build approach.</Empty> : (
        <ul className="space-y-4">
          {list.map((s) => (
            <li key={s.id} className="rounded-xl border border-border px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="rounded-full border border-border px-2 text-[11px] font-medium leading-5 text-muted-foreground">{SECTION_LABEL[s.kind] ?? s.kind}</span>
                  <h3 className="mt-2 break-words text-base font-semibold tracking-tight">{s.title}</h3>
                </div>
                <button type="button" className={cn(btnGhost, '!h-8 !px-2.5')} onClick={() => setEditing(s)}><Pencil className="size-3.5" aria-hidden="true" /> Edit</button>
              </div>
              {s.body ? <p className="mt-2 max-w-[72ch] whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">{s.body}</p> : null}
              <p className="mt-3 text-[11px] text-muted-foreground">Updated {ago(s.updated_at)}</p>
            </li>
          ))}
        </ul>
      )}
      {editing ? <SectionForm dbId={dbId} section={editing === 'new' ? null : editing} next={Math.max(0, ...list.map((s) => s.position)) + 1} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload() }} /> : null}
    </Part>
  )
}

function SectionForm({ dbId, section, next, onClose, onDone }: { dbId: string; section: PlanSection | null; next: number; onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<SectionKind>(section?.kind ?? 'background')
  const [title, setTitle] = useState(section?.title ?? '')
  const [body, setBody] = useState(section?.body ?? '')
  return (
    <FormDialog
      title={section ? 'Edit section' : 'New section'} saveLabel={section ? 'Save changes' : 'Add section'}
      check={{ title, body }} onClose={onClose}
      onSave={async () => {
        if (!title.trim()) throw new Error('Give the section a title.')
        const row = { kind, title: title.trim(), body: body.trim() }
        if (section) unwrap(await supabase.from('gw_plan_sections').update(row).eq('id', section.id))
        else unwrap(await supabase.from('gw_plan_sections').insert({ ...row, database_id: dbId, position: next }))
        onDone()
      }}
    >
      <div><label className={label} htmlFor="ps-kind">Kind</label><Select id="ps-kind" value={kind} onChange={(v) => setKind(v as SectionKind)} options={SECTION_KINDS.map((k) => ({ value: k, label: SECTION_LABEL[k] }))} /></div>
      <div><label className={label} htmlFor="ps-title">Title</label><input id="ps-title" data-autofocus className={field} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></div>
      <div>
        <label className={label} htmlFor="ps-body">Text</label>
        <textarea id="ps-body" className={cn(field, 'min-h-48 resize-y')} value={body} maxLength={60000} onChange={(e) => setBody(e.target.value)} />
        <p className="mt-1.5 text-xs text-muted-foreground">Counts and plain descriptions only. No patient data, emails, phone numbers, ID numbers, connection strings, passwords or keys.</p>
      </div>
    </FormDialog>
  )
}
