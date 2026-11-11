import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Dialog } from './ui'
import '../pages/app/feedback.css'

/**
 * Confirmation dialogs and toast messages for the whole workspace.
 * confirm() replaces the browser's own pop-up with one that matches the site and returns true or false.
 * toast() shows a short message that disappears by itself and can be dismissed.
 */

export type ConfirmOpts = { title: string; body?: string; confirmLabel?: string; danger?: boolean }
type ToastKind = 'ok' | 'err'
type Api = { confirm: (o: string | ConfirmOpts) => Promise<boolean>; toast: (message: string, kind?: ToastKind) => void }

// outside the provider (for example in a test) fall back to the browser so nothing breaks
const Ctx = createContext<Api>({
  confirm: async (o) => window.confirm(typeof o === 'string' ? o : `${o.title}${o.body ? `\n${o.body}` : ''}`),
  toast: () => {},
})

export const useFeedback = () => useContext(Ctx)

/** "Delete "X"? This cannot be undone." becomes a title and a body, with a sensible button label. */
function normalise(o: string | ConfirmOpts): Required<ConfirmOpts> {
  if (typeof o !== 'string') return { body: '', confirmLabel: 'Confirm', danger: false, ...o }
  const q = o.indexOf('?')
  const title = q > 0 ? o.slice(0, q + 1) : o
  const body = q > 0 ? o.slice(q + 1).trim() : ''
  const verb = /^(\w+)/.exec(title)?.[1] ?? 'Confirm'
  return { title, body, confirmLabel: verb, danger: /^(delete|revoke|remove)/i.test(verb) }
}

type Toast = { id: number; message: string; kind: ToastKind }

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [ask, setAsk] = useState<{ o: Required<ConfirmOpts>; done: (v: boolean) => void } | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const next = useRef(1)

  const confirm = useCallback((o: string | ConfirmOpts) => new Promise<boolean>((resolve) => setAsk({ o: normalise(o), done: resolve })), [])
  const toast = useCallback((message: string, kind: ToastKind = 'ok') => {
    const id = next.current++
    setToasts((t) => [...t.slice(-3), { id, message, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'err' ? 7000 : 3800)
  }, [])
  const api = useMemo(() => ({ confirm, toast }), [confirm, toast])

  function close(v: boolean) { ask?.done(v); setAsk(null) }
  // closing with Escape or by clicking outside counts as "no"
  useEffect(() => () => { ask?.done(false) }, [ask])

  return (
    <Ctx.Provider value={api}>
      {children}
      <Dialog open={!!ask} onClose={() => close(false)} title={ask?.o.title ?? ''} size="sm">
        {ask && (
          <div className="cf">
            {ask.o.body && <p className="cf__body">{ask.o.body}</p>}
            <div className="dlg__foot">
              <button type="button" className="btn" onClick={() => close(false)} autoFocus>Cancel</button>
              <button type="button" className={`btn ${ask.o.danger ? 'btn--solid-danger' : 'btn--dark'}`} onClick={() => close(true)}>{ask.o.confirmLabel}</button>
            </div>
          </div>
        )}
      </Dialog>
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div className={`toast toast--${t.kind}`} role={t.kind === 'err' ? 'alert' : 'status'} key={t.id}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {t.kind === 'ok' ? <path d="M5 12l5 5 9-10" /> : <path d="M12 7v6M12 17h.01" />}
            </svg>
            <span>{t.message}</span>
            <button type="button" aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
