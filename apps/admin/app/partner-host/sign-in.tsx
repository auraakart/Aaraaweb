'use client'
import { useState, type FormEvent } from 'react'

export default function HostSignIn({ signedIn = false, unavailable = false }: { signedIn?: boolean; unavailable?: boolean }) {
  const [phone, setPhone] = useState('+91'), [code, setCode] = useState(''), [challengeId, setChallengeId] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(unavailable ? 'Your access could not be verified. Refresh your session or sign in again.' : '')
  async function send(action: string) {
    if (busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/partner-host/session', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, phone: phone.trim(), challengeId, code }) })
      const reply = await response.json() as { challengeId?: string }
      if (!response.ok) throw new Error('Partner access unavailable. Please try again.')
      if (action === 'request' && reply.challengeId) setChallengeId(reply.challengeId)
      else window.location.assign('/partner-host')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Partner access unavailable') }
    finally { setBusy(false) }
  }
  if (signedIn) return <><button disabled={busy} onClick={() => void send('logout')}>Sign out</button>{error && <p role="alert">{error}</p>}</>
  return <main className="login"><section className="loginCard"><h1>Partner sign in</h1><p>Sign in to the workspace for this domain.</p>
    <form onSubmit={(event: FormEvent) => { event.preventDefault(); void send(challengeId ? 'verify' : 'request') }}>
      {challengeId ? <label>6-digit OTP<input autoComplete="one-time-code" inputMode="numeric" maxLength={6} minLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /></label> :
        <label>Mobile number<input type="tel" autoComplete="tel" required value={phone} onChange={event => setPhone(event.target.value)} /></label>}
      <button className="primary" disabled={busy}>{challengeId ? 'Sign in' : 'Send OTP'}</button>
      {challengeId && <button type="button" disabled={busy} onClick={() => { setChallengeId(''); setCode('') }}>Use another number</button>}
    </form>{unavailable && <button disabled={busy} onClick={() => void send('refresh')}>Refresh session</button>}
    {error && <p role="alert">{error}</p>}{busy && <p role="status">Please wait…</p>}</section></main>
}
