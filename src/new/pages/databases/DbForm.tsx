import { useState, type FormEvent } from 'react'
import { supabase } from '../../../lib/supabase'
import { describe, unwrap } from '../../../lib/data'
import { btn, btnPrimary, field, label } from '../calendar/cal'
import { Dialog } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { Combobox } from '@/components/ui/combobox'
import { DB_TYPES, MACHINES, type Db } from './shared'

/** Create a database, or change a database's name, machine, type and status. (Nothing here can delete.) */
export function DbForm({ db, onClose, onDone }: { db?: Db; onClose: () => void; onDone: (id: string) => void }) {
  const [name, setName] = useState(db?.name ?? '')
  const [machine, setMachine] = useState(db?.machine ?? '')
  const [type, setType] = useState(db?.db_type ?? '')
  const [status, setStatus] = useState(db?.status ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const machines = [{ value: '', label: 'Not set' }, ...MACHINES.map((m) => ({ value: m, label: m })), ...(db?.machine && !MACHINES.includes(db.machine) ? [{ value: db.machine, label: db.machine }] : [])]

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!name.trim()) return setErr('Give the database a name.')
    setBusy(true); setErr(null)
    try {
      const row = { name: name.trim(), machine: machine.trim(), db_type: type.trim(), status: status.trim() }
      if (db) { unwrap(await supabase.from('databases').update(row).eq('id', db.id)); onDone(db.id) }
      else {
        const made = unwrap(await supabase.from('databases').insert(row).select('id').single()) as { id: string }
        onDone(made.id)
      }
    } catch (ex) { setErr(describe(ex)); setBusy(false) }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={db ? 'Edit details' : 'New database'}
      size="sm"
      notice={err}
      footer={
        <>
          <button type="button" className={btn} onClick={onClose}>Cancel</button>
          <button type="submit" form="db-form" className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : db ? 'Save' : 'Create'}</button>
        </>
      }
    >
      <form id="db-form" onSubmit={submit} className="space-y-5">
        <div>
          <label className={label} htmlFor="db-name">Name</label>
          <input id="db-name" data-autofocus className={field} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="db-machine">Machine it is on</label>
            <Select id="db-machine" value={machine} onChange={setMachine} options={machines} />
          </div>
          <div>
            <label className={label} htmlFor="db-type">Type</label>
            <Combobox id="db-type" value={type} onChange={setType} options={DB_TYPES} maxLength={60} />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="db-status">Status</label>
          <input id="db-status" className={field} value={status} maxLength={80} onChange={(e) => setStatus(e.target.value)} />
          <p className="mt-1.5 text-xs text-muted-foreground">Free text, for example Phase 1 complete.</p>
        </div>
      </form>
    </Dialog>
  )
}
