'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { operatorConfirm, operatorPrompt } from '../../../lib/operator-dialog'
import { api, type Session } from '../../../lib/admin-client'

type Integration = {
  id: string
  code: string
  name: string
  status: 'ACTIVE' | 'REVOKED'
  createdAt: string
  revokedAt?: string | null
  createdByName?: string | null
  activeMappingCount: number
  quarantinedCount: number
}
type CreatedIntegration = Integration & { integrationKey: string }
type Meter = { id: string; code: string; label?: string | null; meterType: string; active: boolean }
type Receipt = {
  id: string
  idempotencyKey: string
  externalMeterId: string
  status: 'ACCEPTED' | 'QUARANTINED'
  readingId?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  receivedAt: string
  integrationCode: string
  integrationName: string
  meterCode?: string | null
  latestResolutionAction?: string | null
  latestResolutionAt?: string | null
  replacementReceiptId?: string | null
}
type Mapping = {
  id: string
  integrationId: string
  integrationCode: string
  externalMeterId: string
  meterId: string
  meterCode: string
  meterLabel?: string | null
  active: boolean
  createdAt: string
  retiredAt?: string | null
  replacesMappingId?: string | null
}
type IntegrationEvent = {
  id: string
  integrationId: string
  integrationCode: string
  action: string
  actorName: string
  occurredAt: string
}

const readRoles = new Set(['SUPER_ADMIN', 'SOCIETY_ADMIN', 'FACILITY_MANAGER', 'COMMITTEE_MEMBER'])
const manageRoles = new Set(['SUPER_ADMIN', 'SOCIETY_ADMIN', 'FACILITY_MANAGER'])

function getSession(): Session | null {
  try {
    const raw = sessionStorage.getItem('aaraagate.admin.session')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString('en-IN') : '—'

export default function UtilityIntegrationsPage() {
  const session = typeof window === 'undefined' ? null : getSession()
  const canRead = !!session && readRoles.has(session.role)
  const canManage = !!session && manageRoles.has(session.role)
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [meters, setMeters] = useState<Meter[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [events, setEvents] = useState<IntegrationEvent[]>([])
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [selectedIntegrationId, setSelectedIntegrationId] = useState('')
  const [selectedMeterId, setSelectedMeterId] = useState('')
  const [externalMeterId, setExternalMeterId] = useState('')
  const [generatedKey, setGeneratedKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const activeIntegrations = useMemo(() => integrations.filter(item => item.status === 'ACTIVE'), [integrations])
  const quarantined = useMemo(() => receipts.filter(item =>
    item.status === 'QUARANTINED' && !['DISMISSED', 'REPROCESS_ACCEPTED'].includes(item.latestResolutionAction ?? ''),
  ), [receipts])
  const accepted = useMemo(() => receipts.filter(item => item.status === 'ACCEPTED').length, [receipts])

  async function load() {
    if (!session || !canRead) return
    setBusy(true)
    setError('')
    try {
      const [integrationRows, meterRows, receiptRows, mappingRows, eventRows] = await Promise.all([
        api<Integration[]>('/utilities/v2/integrations',{},session),
        api<Meter[]>('/utilities/v2/meters',{},session),
        api<Receipt[]>('/utilities/v2/integrations/receipts',{},session),
        api<Mapping[]>('/utilities/v2/integrations/mappings',{},session),
        api<IntegrationEvent[]>('/utilities/v2/integrations/events',{},session),
      ])
      setIntegrations(integrationRows)
      setMeters(meterRows)
      setReceipts(receiptRows)
      setMappings(mappingRows)
      setEvents(eventRows)
      setSelectedIntegrationId(current =>
        current && integrationRows.some(item => item.id === current && item.status === 'ACTIVE')
          ? current
          : integrationRows.find(item => item.status === 'ACTIVE')?.id ?? '',
      )
      setSelectedMeterId(current =>
        current && meterRows.some(item => item.id === current && item.active)
          ? current
          : meterRows.find(item => item.active)?.id ?? '',
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load utility integrations')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function createIntegration(event: FormEvent) {
    event.preventDefault()
    if (!session || !canManage) return
    setBusy(true)
    setError('')
    setMessage('')
    setGeneratedKey('')
    try {
      const created = await api<CreatedIntegration>('/utilities/v2/integrations', {
        method: 'POST',
        body: JSON.stringify({ code: code.trim(), name: name.trim() }),
      },session)
      setGeneratedKey(created.integrationKey)
      setCode('')
      setName('')
      setMessage('Integration created. Store the key now; Aaraagate will not show it again.')
      await load()
      setSelectedIntegrationId(created.id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create utility integration')
    } finally {
      setBusy(false)
    }
  }

  async function createMapping(event: FormEvent) {
    event.preventDefault()
    if (!session || !canManage || !selectedIntegrationId || !selectedMeterId) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await api(`/utilities/v2/integrations/${selectedIntegrationId}/mappings`, {
        method: 'POST',
        body: JSON.stringify({ externalMeterId: externalMeterId.trim(), meterId: selectedMeterId }),
      },session)
      setExternalMeterId('')
      setMessage('External meter mapping created.')
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create meter mapping')
    } finally {
      setBusy(false)
    }
  }

  async function revoke(integration: Integration) {
    if (!session || !canManage || integration.status !== 'ACTIVE') return
    if (!await operatorConfirm(`Revoke ${integration.code}? Its key will stop accepting readings immediately.`)) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await api(`/utilities/v2/integrations/${integration.id}/revoke`, { method: 'POST' },session)
      setGeneratedKey('')
      setMessage(`${integration.code} revoked.`)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not revoke utility integration')
    } finally {
      setBusy(false)
    }
  }

  async function rotateKey(integration: Integration) {
    if (!session || !canManage || integration.status !== 'ACTIVE') return
    if (!await operatorConfirm(`Rotate the key for ${integration.code}? The current key will stop working immediately.`)) return
    setBusy(true)
    setError('')
    setMessage('')
    setGeneratedKey('')
    try {
      const rotated = await api<CreatedIntegration>(`/utilities/v2/integrations/${integration.id}/rotate-key`, { method: 'POST' },session)
      setGeneratedKey(rotated.integrationKey)
      setMessage(`${integration.code} key rotated. Store the replacement key now; it will not be shown again.`)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not rotate utility integration key')
    } finally {
      setBusy(false)
    }
  }

  async function retireMapping(mapping: Mapping) {
    if (!session || !canManage || !mapping.active) return
    if (!await operatorConfirm(`Retire mapping ${mapping.externalMeterId} → ${mapping.meterCode}? New readings will quarantine until a replacement is active.`)) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await api(`/utilities/v2/integrations/${mapping.integrationId}/mappings/${mapping.id}/retire`, { method: 'POST' },session)
      setMessage(`Mapping ${mapping.externalMeterId} retired; its history was preserved.`)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not retire meter mapping')
    } finally {
      setBusy(false)
    }
  }

  async function replaceMapping(mapping: Mapping) {
    if (!session || !canManage || !mapping.active) return
    const meterId = (await operatorPrompt('Enter the replacement Aaraagate meter UUID. The existing mapping will be retained as retired history.'))?.trim()
    if (!meterId) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await api(`/utilities/v2/integrations/${mapping.integrationId}/mappings/${mapping.id}/replace`, {
        method: 'POST',
        body: JSON.stringify({ meterId }),
      },session)
      setMessage(`Mapping ${mapping.externalMeterId} replaced; the previous mapping remains in history.`)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not replace meter mapping')
    } finally {
      setBusy(false)
    }
  }

  async function resolveReceipt(receipt: Receipt, action: 'dismiss' | 'reprocess') {
    if (!session || !canManage || receipt.status !== 'QUARANTINED') return
    const note = (await operatorPrompt(action === 'dismiss'
      ? 'Record why this quarantined receipt is being dismissed (required).'
      : 'Optional reprocessing note. A new immutable receipt will be created; the original will not change.'))?.trim()
    if (note === undefined || (action === 'dismiss' && !note)) return
    if (action === 'reprocess' && !await operatorConfirm('Reprocess this payload against the current active mapping? This creates a new receipt but never a bill.')) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await api(`/utilities/v2/integrations/receipts/${receipt.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ note: note || undefined }),
      },session)
      setMessage(action === 'dismiss'
        ? 'Quarantine disposition recorded without changing the original receipt.'
        : 'Reprocessing completed with a new receipt linked to the original evidence.')
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Could not ${action} quarantined receipt`)
    } finally {
      setBusy(false)
    }
  }

  async function copyKey() {
    if (!generatedKey) return
    try {
      await navigator.clipboard.writeText(generatedKey)
      setMessage('Integration key copied. Store it in the provider secret manager.')
    } catch {
      setError('Clipboard access failed. Select and copy the key manually.')
    }
  }

  if (!session || !canRead) {
    return <main style={{ padding: 32 }}>
      <h1>Utility integration access required</h1>
      <p>This workspace requires facilities read access.</p>
      <a href="/">Return to Admin</a>
    </main>
  }

  return <main style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 22px 80px' }}>
    <header>
      <small>{session.societyName ?? 'Current society'} · {session.role.replaceAll('_', ' ')}</small>
      <h1 style={{ marginBottom: 8 }}>External utility integrations</h1>
      <p style={{ maxWidth: 850 }}>
        Connect approved meter-data providers through explicit identities and mappings. Imported readings remain operational
        evidence only; this workspace never creates charges, invoices or payments automatically.
      </p>
      <a href="/utilities">← Meter & utility operations</a>
    </header>

    {error && <p style={errorBox}>{error}</p>}
    {message && <p style={successBox}>{message}</p>}

    <section style={grid}>
      <div style={panel}>
        <h2>Integration health</h2>
        <div style={stats}>
          <div><b>{activeIntegrations.length}</b><span>Active connections</span></div>
          <div><b>{accepted}</b><span>Accepted receipts</span></div>
          <div><b>{quarantined.length}</b><span>Quarantined receipts</span></div>
        </div>
        <p><small>Counts are based on the latest 500 ingestion receipts.</small></p>
      </div>
      <div style={panel}>
        <div style={row}>
          <h2 style={{ margin: 0 }}>Operations</h2>
          <button type="button" onClick={() => void load()} disabled={busy} style={secondary}>Reload</button>
        </div>
        <p>Exact retries reuse their original receipt. Recovery runs create linked replacement receipts; original evidence is never edited.</p>
      </div>
    </section>

    {canManage && <section style={grid}>
      <form onSubmit={createIntegration} style={panel}>
        <h2>Create integration</h2>
        <label>Integration code
          <input required maxLength={60} value={code} onChange={event => setCode(event.target.value)} style={input} placeholder="METER-PARTNER-01" />
        </label>
        <label>Provider name
          <input required maxLength={120} value={name} onChange={event => setName(event.target.value)} style={input} placeholder="Approved meter data provider" />
        </label>
        <button disabled={busy} style={button}>Create and issue key</button>
        <p><small>The generated secret is shown once. Rotate an active connection to replace a lost or exposed key.</small></p>
      </form>

      <form onSubmit={createMapping} style={panel}>
        <h2>Map external meter</h2>
        <label>Active integration
          <select required value={selectedIntegrationId} onChange={event => setSelectedIntegrationId(event.target.value)} style={input}>
            <option value="">Select integration</option>
            {activeIntegrations.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
          </select>
        </label>
        <label>External meter ID
          <input required maxLength={160} value={externalMeterId} onChange={event => setExternalMeterId(event.target.value)} style={input} placeholder="provider-meter-0001" />
        </label>
        <label>Aaraagate meter
          <select required value={selectedMeterId} onChange={event => setSelectedMeterId(event.target.value)} style={input}>
            <option value="">Select meter</option>
            {meters.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.code} · {item.label ?? item.meterType}</option>)}
          </select>
        </label>
        <button disabled={busy || !selectedIntegrationId || !selectedMeterId} style={button}>Create mapping</button>
      </form>
    </section>}

    {generatedKey && <section style={{ ...panel, ...keyPanel, marginTop: 18 }}>
      <div>
        <h2 style={{ marginTop: 0 }}>One-time integration key</h2>
        <p style={{ marginBottom: 8 }}>Copy this key into the provider secret manager. It cannot be retrieved after leaving this page.</p>
        <code style={keyCode}>{generatedKey}</code>
      </div>
      <button type="button" onClick={() => void copyKey()} style={button}>Copy key</button>
    </section>}

    <section style={grid}>
      <div style={panel}>
        <h2>Connections</h2>
        {integrations.length === 0
          ? <p>No utility integrations configured.</p>
          : integrations.map(item => <div key={item.id} style={itemRow}>
            <span>
              <b>{item.code} · {item.name}</b><br />
              <small>{item.status} · {item.activeMappingCount} active mappings · {item.quarantinedCount} quarantined</small><br />
              <small>Created {formatDate(item.createdAt)} by {item.createdByName ?? 'Recorded administrator'}</small>
              {item.revokedAt && <><br /><small>Revoked {formatDate(item.revokedAt)}</small></>}
            </span>
            {canManage && item.status === 'ACTIVE' && <span style={actionGroup}>
              <button type="button" disabled={busy} onClick={() => void rotateKey(item)} style={secondary}>Rotate key</button>
              <button type="button" disabled={busy} onClick={() => void revoke(item)} style={danger}>Revoke</button>
            </span>}
          </div>)}
      </div>

      <div style={panel}>
        <h2>Quarantine queue</h2>
        {quarantined.length === 0
          ? <p>No quarantined readings in the latest receipt window.</p>
          : quarantined.slice(0, 100).map(item => <div key={item.id} style={itemRow}>
            <span>
              <b>{item.integrationCode} · {item.externalMeterId}</b><br />
              <small>{item.errorCode ?? 'REJECTED'} · {formatDate(item.receivedAt)}</small><br />
              <small>{item.errorMessage ?? 'Reading requires operational review'}</small><br />
              <small>Idempotency: {item.idempotencyKey}</small>
              {item.latestResolutionAction && <><br /><small>Latest resolution: {item.latestResolutionAction} · {formatDate(item.latestResolutionAt)}</small></>}
            </span>
            {canManage && <span style={actionGroup}>
              <button type="button" disabled={busy} onClick={() => void resolveReceipt(item, 'reprocess')} style={secondary}>Reprocess</button>
              <button type="button" disabled={busy} onClick={() => void resolveReceipt(item, 'dismiss')} style={danger}>Dismiss</button>
            </span>}
          </div>)}
      </div>
    </section>

    <section style={grid}>
      <div style={panel}>
        <h2>Meter mapping history</h2>
        {mappings.length === 0
          ? <p>No meter mappings configured.</p>
          : mappings.map(mapping => <div key={mapping.id} style={itemRow}>
            <span>
              <b>{mapping.integrationCode} · {mapping.externalMeterId}</b><br />
              <small>{mapping.active ? 'ACTIVE' : 'RETIRED'} → {mapping.meterCode} · {mapping.meterLabel ?? 'Utility meter'}</small><br />
              <small>Created {formatDate(mapping.createdAt)}{mapping.retiredAt ? ` · retired ${formatDate(mapping.retiredAt)}` : ''}</small>
            </span>
            {canManage && mapping.active && <span style={actionGroup}>
              <button type="button" disabled={busy} onClick={() => void replaceMapping(mapping)} style={secondary}>Replace</button>
              <button type="button" disabled={busy} onClick={() => void retireMapping(mapping)} style={danger}>Retire</button>
            </span>}
          </div>)}
      </div>

      <div style={panel}>
        <h2>Lifecycle audit trail</h2>
        {events.length === 0
          ? <p>No lifecycle events recorded.</p>
          : events.slice(0, 200).map(event => <div key={event.id} style={itemRow}>
            <span>
              <b>{event.integrationCode} · {event.action.replaceAll('_', ' ')}</b><br />
              <small>{formatDate(event.occurredAt)} · {event.actorName}</small>
            </span>
          </div>)}
      </div>
    </section>

    <section style={{ ...panel, marginTop: 18 }}>
      <h2>Recent ingestion receipts</h2>
      {receipts.length === 0
        ? <p>No external readings received.</p>
        : receipts.slice(0, 200).map(item => <div key={item.id} style={itemRow}>
          <span>
            <b>{item.status} · {item.integrationCode} · {item.externalMeterId}</b><br />
            <small>{formatDate(item.receivedAt)} · Aaraagate meter {item.meterCode ?? 'not mapped'}</small><br />
            <small>Receipt {item.id} · Reading {item.readingId ?? 'not created'}</small>
          </span>
        </div>)}
    </section>
  </main>
}

const panel = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 18, padding: 20, boxShadow: '0 8px 24px rgba(15,23,42,.05)' }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))', gap: 18, marginTop: 18 }
const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }
const input = { display: 'block', width: '100%', boxSizing: 'border-box' as const, padding: '10px 12px', margin: '6px 0 12px', border: '1px solid #cbd5e1', borderRadius: 10, background: '#fff' }
const button = { border: 0, borderRadius: 10, padding: '10px 14px', background: '#05879A', color: '#fff', fontWeight: 700, cursor: 'pointer' }
const secondary = { border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 12px', background: '#fff', fontWeight: 700, cursor: 'pointer' }
const danger = { ...secondary, borderColor: '#fecaca', color: '#b91c1c' }
const actionGroup = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }
const itemRow = { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '13px 10px', borderBottom: '1px solid #eef2f7', borderRadius: 10 }
const stats = { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }
const keyPanel = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18, background: '#fffbeb', borderColor: '#fde68a' }
const keyCode = { display: 'block', maxWidth: 900, overflowWrap: 'anywhere' as const, padding: 12, borderRadius: 10, background: '#111827', color: '#f9fafb' }
const errorBox = { background: '#fff1f2', border: '1px solid #fecdd3', padding: 12, borderRadius: 10, color: '#9f1239' }
const successBox = { background: '#ecfdf5', border: '1px solid #a7f3d0', padding: 12, borderRadius: 10, color: '#065f46' }
