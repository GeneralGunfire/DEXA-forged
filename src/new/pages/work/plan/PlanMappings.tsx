import { useMemo, useState } from 'react'
import { Pencil, Plus, Search, X } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import { unwrap } from '../../../../lib/data'
import { btn, btnGhost, field, label } from '../../calendar/cal'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Empty, FormDialog, Part } from '../FormDialog'
import { MAP_STATUS, type Mapping, type MapStatus } from '../shared'

const TONE: Record<MapStatus, string> = { mapped: 'border-border bg-secondary text-foreground', gap: 'border-destructive/50 text-destructive', conflict: 'border-primary/50 bg-accent/50 text-foreground' }

export function PlanMappings({ dbId, rows, reload }: { dbId: string; rows: Mapping[]; reload: () => void }) {
  const [editing, setEditing] = useState<Mapping | 'new' | null>(null)
  const [status, setStatus] = useState<MapStatus | ''>('')
  const [q, setQ] = useState('')
  const counts = useMemo(() => Object.fromEntries(MAP_STATUS.map((s) => [s, rows.filter((r) => r.status === s).length])) as Record<MapStatus, number>, [rows])
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return rows.filter((r) => (!status || r.status === status) && (!n || [r.source_field, r.canonical_field, r.transform, r.note].some((t) => t.toLowerCase().includes(n))))
      .sort((a, b) => a.source_field.localeCompare(b.source_field))
  }, [rows, status, q])
  const chip = (on: boolean) => cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors', on ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:text-foreground')

  return (
    <Part
      id="mapping" title="Field mapping" count={rows.length} hint="How each field in the source lines up with the shared field names. Field names only, never values."
      action={<button type="button" className={btn} onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden="true" /> Add field</button>}
    >
      {rows.length === 0 ? <Empty>No fields mapped yet.</Empty> : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-52 max-w-sm flex-1">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input type="search" className={cn(field, 'h-9 pl-9 pr-8')} placeholder="Search fields" aria-label="Search the field mapping" value={q} onChange={(e) => setQ(e.target.value)} />
              {q ? <button type="button" aria-label="Clear the search" onClick={() => setQ('')} className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="size-3.5" aria-hidden="true" /></button> : null}
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
              <button type="button" aria-pressed={status === ''} className={chip(status === '')} onClick={() => setStatus('')}>All ({rows.length})</button>
              {MAP_STATUS.map((s) => <button key={s} type="button" aria-pressed={status === s} className={cn(chip(status === s), 'capitalize')} onClick={() => setStatus(status === s ? '' : s)}>{s} ({counts[s]})</button>)}
            </div>
          </div>
          {shown.length === 0 ? <p className="mt-4 rounded-lg border border-border px-4 py-6 text-center text-sm text-muted-foreground">No fields match these filters.</p> : (
            <div className="mt-4 max-h-[32rem] overflow-auto rounded-lg border border-border">
              <table className="w-full min-w-[48rem] border-separate border-spacing-0 text-left text-[13px]">
                <thead>
                  <tr className="text-xs font-medium text-muted-foreground">
                    {['Source field', 'Shared field', 'Transform', 'Status', 'Note', ''].map((h) => <th key={h} scope="col" className="sticky top-0 z-10 border-b border-border bg-card px-3 py-2">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id} className="align-top odd:bg-muted/20">
                      <td className="border-b border-border/60 px-3 py-2.5 font-mono text-xs font-medium text-foreground">{r.source_field}</td>
                      <td className="border-b border-border/60 px-3 py-2.5 font-mono text-xs">{r.canonical_field || <span className="text-muted-foreground">None</span>}</td>
                      <td className="max-w-[16rem] break-words border-b border-border/60 px-3 py-2.5 text-foreground/90">{r.transform || <span className="text-muted-foreground">None</span>}</td>
                      <td className="border-b border-border/60 px-3 py-2.5"><span className={cn('inline-block rounded-full border px-2 text-[11px] font-medium capitalize leading-5', TONE[r.status])}>{r.status}</span></td>
                      <td className="max-w-[18rem] break-words border-b border-border/60 px-3 py-2.5 text-muted-foreground">{r.note}</td>
                      <td className="border-b border-border/60 px-3 py-2 text-right"><button type="button" className={cn(btnGhost, '!h-8 !px-2.5')} onClick={() => setEditing(r)}><Pencil className="size-3.5" aria-hidden="true" /> Edit</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {editing ? <MapForm dbId={dbId} row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload() }} /> : null}
    </Part>
  )
}

function MapForm({ dbId, row, onClose, onDone }: { dbId: string; row: Mapping | null; onClose: () => void; onDone: () => void }) {
  const [source, setSource] = useState(row?.source_field ?? '')
  const [canon, setCanon] = useState(row?.canonical_field ?? '')
  const [transform, setTransform] = useState(row?.transform ?? '')
  const [status, setStatus] = useState<MapStatus>(row?.status ?? 'mapped')
  const [note, setNote] = useState(row?.note ?? '')
  return (
    <FormDialog
      title={row ? 'Edit field' : 'New field'} saveLabel={row ? 'Save changes' : 'Add field'}
      check={{ source, canon, transform, note }} onClose={onClose}
      onSave={async () => {
        if (!source.trim()) throw new Error('Name the source field.')
        const v = { source_field: source.trim(), canonical_field: canon.trim(), transform: transform.trim(), status, note: note.trim() }
        if (row) unwrap(await supabase.from('gw_field_mappings').update(v).eq('id', row.id))
        else unwrap(await supabase.from('gw_field_mappings').insert({ ...v, database_id: dbId }))
        onDone()
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div><label className={label} htmlFor="fm-src">Source field</label><input id="fm-src" data-autofocus className={cn(field, 'font-mono text-xs')} value={source} maxLength={200} onChange={(e) => setSource(e.target.value)} /></div>
        <div><label className={label} htmlFor="fm-can">Shared field</label><input id="fm-can" className={cn(field, 'font-mono text-xs')} value={canon} maxLength={200} onChange={(e) => setCanon(e.target.value)} /></div>
      </div>
      <div><label className={label} htmlFor="fm-tr">Transform</label><input id="fm-tr" className={field} value={transform} maxLength={2000} onChange={(e) => setTransform(e.target.value)} placeholder="e.g. trim and upper-case" /></div>
      <div><label className={label} htmlFor="fm-st">Status</label><Select id="fm-st" value={status} onChange={(v) => setStatus(v as MapStatus)} options={MAP_STATUS.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))} /></div>
      <div><label className={label} htmlFor="fm-note">Note</label><textarea id="fm-note" className={cn(field, 'min-h-20 resize-y')} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} /></div>
    </FormDialog>
  )
}
