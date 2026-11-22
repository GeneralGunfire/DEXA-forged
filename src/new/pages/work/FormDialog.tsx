import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { supabase } from '../../../lib/supabase'
import { useTeam } from '../../../lib/data'
import { checkRedaction } from '../../../lib/redact'
import { btn, btnPrimary } from '../calendar/cal'
import { Dialog } from '@/components/ui/dialog'
import { saveError } from './shared'

/**
 * A popup form that saves without deleting anything. If the save is refused (here or by the database), the message is
 * shown inside the form and every field keeps what the person typed. It never retries on its own.
 */
export function FormDialog({ title, size = 'lg', saveLabel = 'Save', check, onSave, onClose, children }: {
  title: string; size?: 'sm' | 'md' | 'lg'; saveLabel?: string; check?: Record<string, string>
  onSave: () => Promise<void>; onClose: () => void; children: ReactNode
}) {
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(ev: FormEvent) {
    ev.preventDefault()
    if (busy) return
    if (check) { const r = checkRedaction(check); if (!r.ok) return setErr(`${r.message} What you typed is still here.`) }
    setBusy(true); setErr(null)
    try { await onSave() } catch (e) { setErr(saveError(e)); setBusy(false) }
  }
  return (
    <Dialog
      open onClose={onClose} title={title} size={size} notice={err}
      footer={<>
        <button type="button" className={btn} onClick={onClose}>Cancel</button>
        <button type="submit" form="gw-form" className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : saveLabel}</button>
      </>}
    >
      <form id="gw-form" onSubmit={submit} className="space-y-5">{children}</form>
    </Dialog>
  )
}

export const Part = ({ id, title, count, hint, action, children }: { id: string; title: string; count?: number; hint?: string; action?: ReactNode; children: ReactNode }) => (
  <section id={id} aria-label={title} className="border-t border-border pt-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="flex items-baseline gap-3 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {title}{count !== undefined ? <span className="tabular-nums normal-case tracking-normal">{count}</span> : null}
        </h2>
        {hint ? <p className="mt-1.5 max-w-[72ch] text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {action}
    </div>
    <div className="mt-4">{children}</div>
  </section>
)

export const Empty = ({ children }: { children: ReactNode }) => (
  <p className="rounded-xl border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground">{children}</p>
)

/**
 * True when the signed-in person is on the team list, which is who the database lets edit the plan (admins and members).
 * It is false until the team list has loaded, so edit-only controls never flash up for the wrong person. The database
 * still decides: a refused change shows its message.
 */
export function useCanEdit() {
  const { team } = useTeam()
  const [id, setId] = useState<string | null>(null)
  useEffect(() => {
    let on = true
    supabase.auth.getSession().then(({ data }) => { if (on) setId(data.session?.user.id ?? null) })
    return () => { on = false }
  }, [])
  return !!id && team.some((t) => t.user_id === id)
}
