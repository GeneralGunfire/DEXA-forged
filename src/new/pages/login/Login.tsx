import { useState, type CSSProperties, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { setRemember, supabase } from '../../../lib/supabase'
import { Checkbox } from '@/components/ui/checkbox'
import { Note } from '@/components/ui/note'
import { cn } from '@/lib/utils'
import { Orbs } from './Orbs'
import '../../layout/newforge.css'

// Sizes that must not depend on the style order of the old site's global CSS are set inline.
const underline: CSSProperties = { background: 'transparent', borderStyle: 'solid', borderWidth: '0 0 1px', borderRadius: 0, boxShadow: 'none' }
const kicker = 'text-[10px] font-medium uppercase tracking-[0.28em] text-muted-foreground'
const input = 'block w-full border-border px-0 py-2 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-foreground'

/** The sign-in page. New Forge palette and type, scoped to its own .nf wrapper so nothing leaks to other pages. */
export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [keep, setKeep] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [info, setInfo] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setNotice(null); setInfo(false)
    if (!email.trim() || !password) { setNotice('Enter your email and password.'); return }
    setBusy(true)
    try {
      setRemember(keep)
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) {
        setPassword('')
        setNotice(
          error.status === 429 ? 'Too many attempts. Please wait a few minutes and try again.'
            : error.status && error.status >= 500 ? 'The server had a problem. Please try again.'
            : 'Incorrect email or password.',
        )
      }
      // on success the app sees the new session and moves on to /new by itself
    } catch {
      setNotice('Could not reach the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="nf" id="nf-root">
      <Orbs className="absolute inset-0 h-full w-full opacity-30 sm:opacity-100" />
      <main className="relative h-full overflow-y-auto">
        <div className="grid min-h-full place-items-center px-6 py-5 lg:place-items-center lg:justify-items-start lg:pl-[17vw]">
          <div className="w-full max-w-[22rem]">
            <img src="/dexa-logo-navy.png" alt="DEXA" style={{ height: 'clamp(16px, 2.6vh, 20px)', width: 'auto' }} className="mb-[4.5vh] invert brightness-0" />
            <p className={kicker}>Internal workspace</p>
            <h1 style={{ fontSize: 'clamp(2.1rem, 7vh, 3.6rem)' }} className="mt-[1.6vh] font-semibold uppercase leading-[0.92] tracking-tighter">DEXA<br />Forged</h1>

            <form onSubmit={onSubmit} noValidate className="mt-[5vh]">
              <label className={kicker} htmlFor="lg-email">Email</label>
              <input id="lg-email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} inputMode="email"
                style={underline} className={cn(input, 'mb-[3vh]')} placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />

              <label className={kicker} htmlFor="lg-password">Password</label>
              <div className="relative mb-[2.6vh]">
                <input id="lg-password" type={show ? 'text' : 'password'} autoComplete="current-password"
                  style={underline} className={cn(input, 'pr-10')} value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow((s) => !s)}
                  className="absolute right-0 top-1/2 grid size-9 -translate-y-1/2 place-items-center text-muted-foreground transition-colors hover:text-foreground">
                  {show ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                </button>
              </div>

              <Checkbox checked={keep} onChange={setKeep} className="text-muted-foreground">Keep me signed in on this device</Checkbox>

              <button type="submit" disabled={busy}
                style={{ background: '#fafafa', color: '#171717' }}
                className="mt-[3.6vh] h-11 w-full rounded-full text-xs font-semibold uppercase tracking-[0.22em] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
              {notice ? <Note ok={info}>{notice}</Note> : null}
            </form>

            <div className="mt-[4vh] flex flex-col items-start gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              <button type="button" className="uppercase tracking-[0.2em] transition-colors hover:text-foreground"
                onClick={() => { setNotice('Password resets are handled by the DEXA team. Contact Rajen or Huzayfa.'); setInfo(true) }}>Forgot password?</button>
              <span>Accounts are created by the DEXA team</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
