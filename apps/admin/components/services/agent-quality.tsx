'use client'
import { useEffect, useRef, useState } from 'react'
import { qualityItems, record, type QualityItem, type ServiceRequest } from '../../lib/services-quality'

type Assignment = { id: string; bookingId: string; offeringName: string; status: string }
type Snapshot = { assignmentId: string; bookingId: string; assignmentStatus: string; bookingStatus: string; captured: boolean; items: QualityItem[] }
type Evidence = { id: string; itemId: string; passed: boolean; note?: string; recordedAt: string }
export function AgentQuality({ request }: { request: ServiceRequest }) {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [selected, setSelected] = useState('')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [events, setEvents] = useState<Evidence[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<Record<string, { decision: string; note: string }>>({})
  const generation = useRef(0)
  useEffect(() => {
    const run = ++generation.current
    setAssignments([]); setSelected(''); setSnapshot(null); setEvents([]); setDraft({}); setError(''); setMessage(''); setBusy(true)
    request('/provider-agent/services/assignments').then(raw => {
      if (!Array.isArray(raw) || raw.some(v => typeof v.id !== 'string' || typeof v.bookingId !== 'string')) throw Error('Invalid assignments')
      if (run === generation.current) setAssignments(raw)
    }).catch(() => { if (run === generation.current) setError('Field-agent access or assignments are unavailable. A verified agent identity must be linked to your account.') })
      .finally(() => { if (run === generation.current) setBusy(false) })
    return () => { generation.current++ }
  }, [request])
  const load = async (id: string, run: number) => {
    setSnapshot(null); setEvents([]); setError(''); setDraft({})
    const [raw, history] = await Promise.all([
      request(`/provider-agent/services/assignments/${id}/quality-checklist`),
      request(`/provider-agent/services/assignments/${id}/quality-evidence`),
    ])
    const data = record(raw), assignment = assignments.find(a => a.id === id)
    if (!assignment || data.assignmentId !== id || data.bookingId !== assignment.bookingId ||
        typeof data.captured !== 'boolean' || data.immutable !== data.captured ||
        typeof data.assignmentStatus !== 'string' || typeof data.bookingStatus !== 'string' ||
        !Number.isSafeInteger(data.templateVersion) || Number(data.templateVersion) < (data.captured ? 1 : 0)) throw Error('Invalid assignment checklist')
    const items = qualityItems(data.items)
    if (!data.captured && items.length !== 0) throw Error('Legacy checklist mismatch')
    if (!Array.isArray(history) || history.some(v => v.assignmentId !== id || v.bookingId !== assignment.bookingId || typeof v.passed !== 'boolean' || typeof v.itemId !== 'string')) throw Error('Invalid assignment evidence')
    if (run !== generation.current) return
    setSnapshot({ assignmentId: id, bookingId: assignment.bookingId, assignmentStatus: String(data.assignmentStatus), bookingStatus: String(data.bookingStatus), captured: data.captured, items })
    setEvents(history)
  }
  const refresh = async () => {
    const run = ++generation.current
    setBusy(true); setMessage('')
    try { await load(selected, run) } catch (e) { if (run === generation.current) setError(e instanceof Error ? e.message : 'Checklist unavailable') }
    finally { if (run === generation.current) setBusy(false) }
  }
  const write = async (suffix: string, body: Record<string, unknown>, assessment = false) => {
    if (!snapshot || busy) return
    const run = generation.current, id = snapshot.assignmentId
    setBusy(true); setError(''); setMessage(''); setSnapshot(null)
    try {
      await request(`/provider-agent/services/assignments/${id}/${suffix}`, { method: 'POST', body: JSON.stringify(body) })
      await load(id, run)
      if (run === generation.current) setMessage(assessment ? 'Assessment recorded in the service history.' : 'Service status updated.')
    } catch { if (run === generation.current) setError('Update could not be confirmed. Refresh the checklist and history before submitting again; the previous update may have succeeded.') }
    finally { if (run === generation.current) setBusy(false) }
  }
  const assess = snapshot?.captured && snapshot.assignmentStatus === 'ARRIVED' && snapshot.bookingStatus === 'IN_PROGRESS'
  return <section aria-label="Field-agent workspace" style={{ background: 'white', borderRadius: 20, padding: 24 }}>
    <h1>Field-agent workspace</h1><p>Only assignments linked to your own verified agent account are available. Provider operator access does not grant technician evidence authority.</p>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <label>My assignment <select value={selected} disabled={busy} onChange={e => { generation.current++; setSelected(e.target.value); setSnapshot(null); setEvents([]); setError(''); setMessage(''); setDraft({}) }}>
      <option value="">Choose an assignment</option>{assignments.map(a => <option key={a.id} value={a.id}>{a.offeringName} · {a.status}</option>)}
    </select></label>{' '}<button disabled={busy || !selected} onClick={() => void refresh()}>Refresh assignment checklist</button>
    {!busy && !error && assignments.length === 0 && <p>No assignments are available.</p>}
    {snapshot && <div><p>Dispatch: {snapshot.assignmentStatus}. Booking: {snapshot.bookingStatus}.</p>
      {['ASSIGNED', 'ACCEPTED', 'EN_ROUTE'].includes(snapshot.assignmentStatus) && <button disabled={busy} onClick={() => void write('status', { status: snapshot.assignmentStatus === 'ASSIGNED' ? 'ACCEPTED' : snapshot.assignmentStatus === 'ACCEPTED' ? 'EN_ROUTE' : 'ARRIVED' })}>
        {snapshot.assignmentStatus === 'ASSIGNED' ? 'Accept assignment' : snapshot.assignmentStatus === 'ACCEPTED' ? 'Mark en route' : 'Mark arrived'}</button>}
      {snapshot.assignmentStatus === 'ARRIVED' && snapshot.bookingStatus === 'CONFIRMED' && <button disabled={busy} onClick={() => void write('start-service', {})}>Start service</button>}
      {!snapshot.captured ? <p>No checklist was captured for this booking. Current offering changes do not add requirements retrospectively.</p> : snapshot.items.length === 0 ? <p>This booking has no checklist steps.</p> : snapshot.items.map(item => {
        const latest = events.filter(e => e.itemId === item.id).at(-1)
        const value = draft[item.id] ?? { decision: '', note: '' }
        return <fieldset key={item.id} disabled={busy || !assess}><legend>{item.label} · {item.required ? 'Required' : 'Optional'}</legend>
          <p>Latest recorded assessment: {latest ? latest.passed ? 'Passed' : 'Needs attention' : 'Not recorded'}</p>
          <label>Assessment for {item.label}<select value={value.decision} onChange={e => setDraft({ ...draft, [item.id]: { ...value, decision: e.target.value } })}><option value="">Choose a result</option><option value="pass">Passed</option><option value="fail">Needs attention</option></select></label>{' '}
          <label>Note for {item.label}<input maxLength={500} value={value.note} onChange={e => setDraft({ ...draft, [item.id]: { ...value, note: e.target.value } })}/></label>{' '}
          <button disabled={busy || !assess || !value.decision} onClick={() => void write('quality-evidence', { itemId: item.id, passed: value.decision === 'pass', note: value.note.trim() || undefined }, true)}>Record {item.label}</button>
        </fieldset>
      })}
      {snapshot.assignmentStatus === 'ARRIVED' && snapshot.bookingStatus === 'IN_PROGRESS' && <button disabled={busy} onClick={() => void write('request-completion', {})}>Request resident completion review</button>}
      <p>The server checks the latest required assessments before completion. Assessments do not certify quality, approve a warranty or authorize a charge.</p>
      <h2>Assessment history</h2>{events.length === 0 ? <p>No assessments recorded.</p> : <ul>{events.map(e => <li key={e.id}>{snapshot.items.find(item => item.id === e.itemId)?.label ?? e.itemId}: {e.passed ? 'Passed' : 'Needs attention'}{e.note ? ` — ${e.note}` : ''}</li>)}</ul>}
    </div>}
  </section>
}
