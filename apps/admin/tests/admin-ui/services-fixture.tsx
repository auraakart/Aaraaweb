import React from 'react'
import { createRoot } from 'react-dom/client'
import { ProviderQuality } from '../../components/services/provider-quality'
import { AgentQuality } from '../../components/services/agent-quality'
import { DispatchWorkspace } from '../../components/services/dispatch-workspace'
const params = new URLSearchParams(location.search)
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222'
const requests: { path: string; method: string; body: unknown }[] = []
Object.assign(window, { serviceRequests: requests })
let version = 2, assigned = false
let items = [{ id: 'inspect_filter', label: 'Inspect filter', required: true }]
const evidence: Record<string, unknown>[] = []
async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const body = init.body ? JSON.parse(String(init.body)) : null
  requests.push({ path, method: init.method ?? 'GET', body })
  if (params.has('denied')) throw Error('Not authorized')
  if (path === '/provider/services/quality-summary') return { periodDays: 90, reviewOnly: true, qualityScore: null, publicRankingEnabled: false, automaticPenaltyEnabled: false, completedBookings: 8, completedWithChecklist: 6, reworkRequests: 2, openReworkRequests: 1 }
  if (path.startsWith('/provider/services/offerings/')) {
    if (init.method === 'PUT') { if (params.has('conflict')) throw Error('Checklist changed; reload and retry with the latest version'); version++; items = body.items }
    return { offeringId: path.includes(b) ? b : a, version, items }
  }
  if (path === '/provider-agent/services/assignments') return [{ id: a, bookingId: b, offeringName: 'AC service', status: 'ARRIVED' }]
  if (path.endsWith('/quality-checklist')) return { assignmentId: a, bookingId: params.has('foreign') ? a : b, assignmentStatus: 'ARRIVED', bookingStatus: 'IN_PROGRESS', templateVersion: 2, captured: true, immutable: true, items }
  if (path.endsWith('/quality-evidence')) {
    if (init.method === 'POST') evidence.push({ id: String(evidence.length), assignmentId: a, bookingId: b, ...body, recordedAt: new Date().toISOString() })
    return evidence
  }
  if (path.endsWith('/assignments')) return assigned ? [{ id: a, bookingId: b, agentDisplayName: 'Ravi', status: 'ASSIGNED' }] : []
  if (path.endsWith('/dispatch-candidates')) return { bookingId: b, provisional: true, assignmentRequired: true, residentPreferenceGuaranteed: false, candidates: [{ agentId: a, displayName: 'Ravi', activeAssignmentCount: 1, hasScheduleConflict: params.has('overlap'), provisionallyAvailable: !params.has('overlap'), availabilityConfirmed: false, skillsVerifiedForOffering: false, etaMinutes: null, residentRequested: true }] }
  if (path.endsWith('/quick-dispatch')) { assigned = true; if (params.has('lost')) throw Error('Connection lost'); return { id: a, bookingId: b, agentDisplayName: 'Ravi', status: 'ASSIGNED' } }
  throw Error('Unexpected request ' + path)
}
const mode = params.get('mode')
createRoot(document.getElementById('root')!).render(<main style={{ maxWidth: 900, margin: 'auto', padding: 24 }}>
  {mode === 'agent' ? <AgentQuality request={request}/> : mode === 'dispatch' ? <DispatchWorkspace request={request} initialBookingId={b}/> : <ProviderQuality request={request} offerings={[{ id: a, name: 'AC service', active: true }, { id: b, name: 'Plumbing', active: true }]}/>}
</main>)
