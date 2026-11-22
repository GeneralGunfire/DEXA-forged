import { useState } from 'react'
import { Check, Pencil, Plus } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import { unwrap } from '../../../../lib/data'
import { btn, btnGhost, field, label } from '../../calendar/cal'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Empty, FormDialog, Part } from '../FormDialog'
import { CONFIDENCE, saveError, type ConnOption, type Confidence } from '../shared'
import { Note } from '@/components/ui/note'

const TONE: Record<Confidence, string> = {
  confirmed: 'border-primary/50 bg-primary/10 text-foreground',
  assumed: 'border-border bg-secondary text-foreground',
  unknown: 'border-border text-muted-foreground',
}
export const Confidence_ = ({ c }: { c: Confidence }) => <span className={cn('inline-block rounded-full border px-2 text-[11px] font-medium capitalize leading-5', TONE[c])}>{c}</span>

export function PlanConnections({ dbId, options, reload }: { dbId: string; options: ConnOption[]; reload: () => void }) {
  const [editing, setEditing] = useState<ConnOption | 'new' | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  /** "Mark chosen" is one call to the database function, which clears any other chosen route and sets this one. */
  async function choose(o: ConnOption) {
    if (busy) return
    setBusy(o.id); setMsg(null)
    try {
      if (o.chosen) unwrap(await supabase.from('gw_connection_options').update({ chosen: false }).eq('id', o.id))
      else { const { error } = await supabase.rpc('gw_choose_connection', { p_id: o.id }); if (error) throw error }
      reload()
    } catch (e) { setMsg(saveError(e, false)); reload() } finally { setBusy(null) }
  }

  return (
    <Part
      id="connection" title="Connection options" count={options.length} hint="The ways the gateway could reach the real source. One route can be marked as chosen."
      action={<button type="button" className={btn} onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden="true" /> Add route</button>}
    >
      {options.length === 0 ? <Empty>No routes recorded yet.</Empty> : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[56rem] border-separate border-spacing-0 text-left text-[13px]">
            <thead>
              <tr className="text-xs font-medium text-muted-foreground">
                {['Route', 'Owner', 'Approval needed', 'POPIA note', 'Confidence', ''].map((h) => <th key={h} scope="col" className="border-b border-border bg-card px-3 py-2">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {options.map((o) => (
                <tr key={o.id} className={cn('align-top', o.chosen && 'bg-primary/[0.06]')}>
                  <td className="max-w-[22rem] border-b border-border/60 px-3 py-3">
                    <span className="flex flex-wrap items-center gap-2 font-medium text-foreground">{o.route}{o.chosen ? <span className="inline-flex items-center gap-1 rounded-full border border-primary/60 px-2 text-[11px] leading-5 text-primary"><Check className="size-3" aria-hidden="true" /> Chosen</span> : null}</span>
                    {o.description ? <span className="mt-1 block whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">{o.description}</span> : null}
                  </td>
                  <td className="border-b border-border/60 px-3 py-3 text-foreground/90">{o.owner_party || <span className="text-muted-foreground">Not set</span>}</td>
                  <td className="max-w-[14rem] border-b border-border/60 px-3 py-3 text-foreground/90">{o.approval_needed || <span className="text-muted-foreground">Not set</span>}</td>
                  <td className="max-w-[14rem] border-b border-border/60 px-3 py-3 text-foreground/90">{o.popia_note || <span className="text-muted-foreground">Not set</span>}</td>
                  <td className="border-b border-border/60 px-3 py-3"><Confidence_ c={o.confidence} /></td>
                  <td className="whitespace-nowrap border-b border-border/60 px-3 py-3 text-right">
                    <button type="button" className={cn(btnGhost, '!h-8 !px-2.5')} disabled={busy !== null} onClick={() => choose(o)}>{o.chosen ? 'Unmark chosen' : 'Mark chosen'}</button>
                    <button type="button" className={cn(btnGhost, '!h-8 !px-2.5')} onClick={() => setEditing(o)}><Pencil className="size-3.5" aria-hidden="true" /> Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {msg ? <Note>{msg}</Note> : null}
      {editing ? <ConnForm dbId={dbId} option={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload() }} /> : null}
    </Part>
  )
}

function ConnForm({ dbId, option, onClose, onDone }: { dbId: string; option: ConnOption | null; onClose: () => void; onDone: () => void }) {
  const [route, setRoute] = useState(option?.route ?? '')
  const [description, setDescription] = useState(option?.description ?? '')
  const [owner, setOwner] = useState(option?.owner_party ?? '')
  const [approval, setApproval] = useState(option?.approval_needed ?? '')
  const [popia, setPopia] = useState(option?.popia_note ?? '')
  const [confidence, setConfidence] = useState<Confidence>(option?.confidence ?? 'unknown')
  return (
    <FormDialog
      title={option ? 'Edit route' : 'New route'} saveLabel={option ? 'Save changes' : 'Add route'}
      check={{ route, description, owner, approval, popia }} onClose={onClose}
      onSave={async () => {
        if (!route.trim()) throw new Error('Name the route.')
        const row = { route: route.trim(), description: description.trim(), owner_party: owner.trim(), approval_needed: approval.trim(), popia_note: popia.trim(), confidence }
        if (option) unwrap(await supabase.from('gw_connection_options').update(row).eq('id', option.id))
        else unwrap(await supabase.from('gw_connection_options').insert({ ...row, database_id: dbId, chosen: false }))
        onDone()
      }}
    >
      <div><label className={label} htmlFor="co-route">Route</label><input id="co-route" data-autofocus className={field} value={route} maxLength={200} onChange={(e) => setRoute(e.target.value)} placeholder="e.g. Read-only export from the owner" /></div>
      <div><label className={label} htmlFor="co-desc">Description</label><textarea id="co-desc" className={cn(field, 'min-h-24 resize-y')} value={description} maxLength={5000} onChange={(e) => setDescription(e.target.value)} /></div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div><label className={label} htmlFor="co-owner">Who owns the source</label><input id="co-owner" className={field} value={owner} maxLength={300} onChange={(e) => setOwner(e.target.value)} /></div>
        <div><label className={label} htmlFor="co-conf">Confidence</label><Select id="co-conf" value={confidence} onChange={(v) => setConfidence(v as Confidence)} options={CONFIDENCE.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))} /></div>
      </div>
      <div><label className={label} htmlFor="co-appr">Approval needed</label><textarea id="co-appr" className={cn(field, 'min-h-16 resize-y')} value={approval} maxLength={2000} onChange={(e) => setApproval(e.target.value)} /></div>
      <div><label className={label} htmlFor="co-popia">POPIA note</label><textarea id="co-popia" className={cn(field, 'min-h-16 resize-y')} value={popia} maxLength={2000} onChange={(e) => setPopia(e.target.value)} /></div>
    </FormDialog>
  )
}
