'use client'
import { useEffect, useRef, useState } from 'react'
import { record, type ServiceRequest } from '../../lib/services-quality'
type Candidate = { agentId: string; displayName: string; activeAssignmentCount: number; hasScheduleConflict: boolean; residentRequested: boolean }
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export function DispatchWorkspace({ request, initialBookingId = '' }: { request: ServiceRequest; initialBookingId?: string }) {
  const [bookingId, setBookingId] = useState(initialBookingId)
  const [loadedId, setLoadedId] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [assignments, setAssignments] = useState<Record<string, unknown>[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirm, setConfirm] = useState(false)
  const generation = useRef(0)
  useEffect(() => { generation.current++; setLoadedId(''); setCandidates([]); setAssignments([]); setError(''); setMessage(''); setConfirm(false); setBusy(false); return () => { generation.current++ } }, [request])
  const load = async () => {
    if (!uuid.test(bookingId) || busy) return
    const run = ++generation.current
    setBusy(true); setLoadedId(''); setCandidates([]); setAssignments([]); setError(''); setMessage(''); setConfirm(false)
    try {
      const assigned = await request(`/platform/services/consumer-bookings/${bookingId}/assignments`)
      if (!Array.isArray(assigned) || assigned.some(a => a.bookingId !== bookingId || typeof a.status !== 'string')) throw Error('Invalid assignment history')
      const active = assigned.some(a => ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'].includes(a.status))
      let shortlist: Candidate[] = []
      if (!active) {
        const data = record(await request(`/platform/services/consumer-bookings/${bookingId}/dispatch-candidates`))
        if (data.bookingId !== bookingId || data.provisional !== true || data.assignmentRequired !== true || data.residentPreferenceGuaranteed !== false || !Array.isArray(data.candidates) || data.candidates.length > 25) throw Error('Invalid dispatch candidates')
        shortlist = data.candidates.map(raw => {
          const c = record(raw)
          if (typeof c.agentId !== 'string' || typeof c.displayName !== 'string' || typeof c.hasScheduleConflict !== 'boolean' ||
              c.provisionallyAvailable !== !c.hasScheduleConflict || c.availabilityConfirmed !== false || c.skillsVerifiedForOffering !== false ||
              c.etaMinutes !== null || typeof c.residentRequested !== 'boolean' || !Number.isSafeInteger(c.activeAssignmentCount) || Number(c.activeAssignmentCount) < 0) throw Error('Invalid candidate eligibility')
          return c as Candidate
        })
      }
      if (run !== generation.current) return
      setAssignments(assigned); setCandidates(shortlist); setLoadedId(bookingId)
    } catch (e) { if (run === generation.current) setError(e instanceof Error ? e.message : 'Dispatch unavailable') }
    finally { if (run === generation.current) setBusy(false) }
  }
  const dispatch = async () => {
    if (busy || !confirm || loadedId !== bookingId || !candidates.some(c => !c.hasScheduleConflict)) return
    const run = generation.current
    setBusy(true); setConfirm(false); setLoadedId(''); setCandidates([]); setError(''); setMessage('')
    try {
      const result = record(await request(`/platform/services/consumer-bookings/${bookingId}/quick-dispatch`, { method: 'POST' }))
      if (result.bookingId !== bookingId || result.status !== 'ASSIGNED') throw Error('Invalid dispatch receipt')
      if (run === generation.current) { setAssignments([result]); setMessage('Technician assigned. The server rechecked provider ownership, active assignments and schedule conflicts. Refresh to inspect the latest dispatch state.') }
    } catch { if (run === generation.current) setError('Assignment could not be confirmed. Refresh dispatch before another attempt; it may already have succeeded or the shortlist may have changed.') }
    finally { if (run === generation.current) setBusy(false) }
  }
  const active = assignments.some(a => ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'].includes(String(a.status)))
  return <section aria-label="Dispatch review"><h1>Service dispatch review</h1>
    <p>Review provider-scoped schedule conflicts and requests. Candidates are provisional; physical availability and skills are not certified.</p>
    <label>Booking reference<input value={bookingId} disabled={busy} onChange={e => { generation.current++; setBookingId(e.target.value.trim()); setLoadedId(''); setCandidates([]); setAssignments([]); setConfirm(false); setError(''); setMessage('') }}/></label>{' '}
    <button disabled={busy || !uuid.test(bookingId)} onClick={() => void load()}>Refresh dispatch</button>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {assignments.length > 0 && <><h2>Recorded assignments</h2><ul>{assignments.map((a, i) => <li key={String(a.id ?? i)}>{String(a.agentDisplayName ?? 'Service professional')} · {String(a.status)}</li>)}</ul></>}
    {active && <p>An active assignment already exists. Quick dispatch is unavailable.</p>}
    {loadedId && !active && <><h2>Provisional candidates</h2>{candidates.length === 0 ? <p>No eligible provider agents found.</p> : <ul>{candidates.map(c => <li key={c.agentId}>{c.displayName} · {c.hasScheduleConflict ? 'Schedule conflict' : 'No recorded schedule conflict'} · {c.activeAssignmentCount} active assignments{c.residentRequested ? ' · Requested by resident (not guaranteed)' : ''}</li>)}</ul>}
      <label><input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)}/>I confirm dispatching the first currently conflict-free candidate. The server may reject a stale shortlist.</label>{' '}
      <button disabled={busy || !confirm || !candidates.some(c => !c.hasScheduleConflict)} onClick={() => void dispatch()}>Confirm quick dispatch</button>
    </>}
  </section>
}
