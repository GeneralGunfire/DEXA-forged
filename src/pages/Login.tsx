import { useState, type FormEvent } from 'react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [remember, setRemember] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setNotice(null)
    setBusy(true)
    // Supabase email/password sign-in is wired in the next step.
    window.setTimeout(() => {
      setBusy(false)
      setNotice('Sign-in is not connected yet. This is the visual design only.')
    }, 500)
  }

  return (
    <main className="login">
      <div className="login__form">
        <header className="login__brand">
          <img src="/dexa-logo-navy.png" alt="DEXA" />
        </header>

        <section className="login__main" aria-labelledby="login-title">
          <h1 id="login-title">Welcome to Forged</h1>
          <p className="login__sub">Sign in to the DEXA internal workspace.</p>

          <form onSubmit={onSubmit} noValidate>
            <label className="field">
              <span className="field__label">Email</span>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@dexa.co.za"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <div className="field">
              <div className="field__head">
                <label className="field__label" htmlFor="password">Password</label>
                <button
                  type="button"
                  className="link"
                  onClick={() =>
                    setNotice('Password resets are handled by the DEXA team. Contact Rajen or Huzayfa.')
                  }
                >
                  Forgot password?
                </button>
              </div>
              <div className="field__wrap">
                <input
                  id="password"
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="field__eye"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                  aria-pressed={show}
                >
                  {show ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3l18 18" /><path d="M10.6 6.1A10.6 10.6 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3.2 3.9" /><path d="M6.6 6.7A17 17 0 0 0 2.5 12S6 18 12 18c1.4 0 2.6-.3 3.7-.8" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></svg>
                  )}
                </button>
              </div>
            </div>

            <label className="check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>Keep me signed in on this device</span>
            </label>

            <button className="submit" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>

            <p className="notice" role="status" aria-live="polite">{notice}</p>
          </form>

          <p className="login__hint">Accounts are created by the DEXA team.</p>
        </section>

        <footer className="login__foot">© 2026 DEXA. Authorised users only.</footer>
      </div>

      <aside className="login__photo" aria-hidden="true">
        <div className="login__caption">
          <p className="login__kicker">DEXA Forged</p>
          <p className="login__lead">Where we build South Africa&rsquo;s health data interoperability.</p>
        </div>
      </aside>
    </main>
  )
}
