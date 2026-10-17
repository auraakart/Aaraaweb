'use client'
import { useCallback, useEffect, useState } from 'react'
import { DispatchWorkspace } from '../../../components/services/dispatch-workspace'
import { api, type Session } from '../../../lib/admin-client'
function currentSession(): Session | null {
  try { const raw = sessionStorage.getItem('aaraagate.admin.session'); return raw ? JSON.parse(raw) as Session : null } catch { return null }
}
export default function ServiceDispatchPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [bookingId, setBookingId] = useState('')
  useEffect(() => {
    setSession(currentSession()); setBookingId(new URLSearchParams(window.location.search).get('bookingId') ?? '')
    const changed = () => setSession(currentSession())
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [])
  const request = useCallback(async (path: string, init?: RequestInit) => {
    const current = currentSession()
    if (!session || current?.role !== 'SUPER_ADMIN' || current.sessionId !== session.sessionId || current.societyId !== session.societyId) throw Error('Sign in again to review dispatch')
    const result = await api<unknown>(path, init, current)
    const after = currentSession()
    if (!after || after.sessionId !== current.sessionId || after.societyId !== current.societyId || after.role !== current.role) throw Error('Session changed; reload dispatch')
    return result
  }, [session])
  if (session?.role !== 'SUPER_ADMIN') return <main><h1>Super Admin access required</h1><a href="/">Return to Admin</a></main>
  return <main style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}><a href="/marketplace-control/operations">Services operations</a><DispatchWorkspace key={`${session.sessionId}:${bookingId}`} request={request} initialBookingId={bookingId}/></main>
}
