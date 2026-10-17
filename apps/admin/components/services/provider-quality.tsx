'use client'
import { useEffect, useRef, useState } from 'react'
import { qualityItems, qualitySummary, qualityTemplate, type QualityItem, type ServiceRequest } from '../../lib/services-quality'

export function ProviderQuality({ request, offerings }: { request: ServiceRequest; offerings: { id: string; name: string; active: boolean }[] }) {
  const [selected, setSelected] = useState('')
  const [version, setVersion] = useState<number | null>(null)
  const [items, setItems] = useState<QualityItem[]>([])
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const generation = useRef(0)
  useEffect(() => { generation.current++; setVersion(null); setItems([]); setSummary(null); setError(''); setMessage(''); setBusy(false); return () => { generation.current++ } }, [request])
  const load = async () => {
    const run = ++generation.current
    setBusy(true); setVersion(null); setItems([]); setError(''); setMessage('')
    try {
      const data = qualityTemplate(await request(`/provider/services/offerings/${selected}/quality-checklist`), selected)
      if (run !== generation.current) return
      setVersion(data.version); setItems(data.items)
    } catch (e) { if (run === generation.current) setError(e instanceof Error ? e.message : 'Checklist unavailable') }
    finally { if (run === generation.current) setBusy(false) }
  }
  const save = async () => {
    if (version === null || busy) return
    const run = generation.current
    setBusy(true); setError(''); setMessage('')
    try {
      const body = { expectedVersion: version, items: qualityItems(items) }
      const data = qualityTemplate(await request(`/provider/services/offerings/${selected}/quality-checklist`, { method: 'PUT', body: JSON.stringify(body) }), selected)
      if (run !== generation.current) return
      setVersion(data.version); setItems(data.items); setMessage('Checklist saved for future bookings. Existing bookings keep their original checklist.')
    } catch (e) {
      if (run === generation.current) { setVersion(null); setError(`${e instanceof Error ? e.message : 'Save could not be confirmed'}. Reload before saving again; your last save may already have succeeded.`) }
    } finally { if (run === generation.current) setBusy(false) }
  }
  const loadSummary = async () => {
    const run = generation.current
    setSummary(null); setError('')
    try { const data = qualitySummary(await request('/provider/services/quality-summary')); if (run === generation.current) setSummary(data) }
    catch (e) { if (run === generation.current) setError(e instanceof Error ? e.message : 'Summary unavailable') }
  }
  return <section aria-label="Service quality" style={{ background: 'white', borderRadius: 20, padding: 24 }}>
    <h1>Service quality</h1><p>Checklists guide future bookings. Required steps are checked before completion. They do not extend warranty or promise a free revisit.</p>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <label>Service offering <select value={selected} disabled={busy} onChange={e => { generation.current++; setSelected(e.target.value); setVersion(null); setItems([]); setError(''); setMessage('') }}>
      <option value="">Choose an active offering</option>{offerings.filter(o => o.active).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select></label>{' '}<button disabled={!selected || busy} onClick={() => void load()}>Load checklist</button>
    {version !== null && <div><p>Template version {version}. Changes apply only to future bookings.</p>
      {items.map((item, index) => <fieldset key={index} disabled={busy}><legend>Step {index + 1}</legend>
        <label>Step key {index + 1}<input maxLength={40} value={item.id} onChange={e => setItems(items.map((v, i) => i === index ? { ...v, id: e.target.value } : v))}/></label>{' '}
        <label>Step label {index + 1}<input maxLength={120} value={item.label} onChange={e => setItems(items.map((v, i) => i === index ? { ...v, label: e.target.value } : v))}/></label>{' '}
        <label><input type="checkbox" checked={item.required} onChange={e => setItems(items.map((v, i) => i === index ? { ...v, required: e.target.checked } : v))}/>Required step {index + 1}</label>{' '}
        <button onClick={() => setItems(items.filter((_, i) => i !== index))}>Remove step {index + 1}</button>
      </fieldset>)}
      <p>{items.length === 0 && 'No checklist steps configured. Saving an empty list removes steps only for future bookings.'}</p>
      <button disabled={busy || items.length >= 20} onClick={() => setItems([...items, { id: '', label: '', required: true }])}>Add checklist step</button>{' '}
      <button disabled={busy} onClick={() => void save()}>Save checklist</button>
    </div>}
    <hr/><h2>Private quality activity</h2><p>90-day operational counts, based on current completion state and update time. These are not quality scores or public rankings.</p>
    <button onClick={() => void loadSummary()}>Refresh quality activity</button>
    {summary && <dl>{[['completedBookings', 'Completed bookings'], ['completedWithChecklist', 'Completed with a captured checklist'], ['reworkRequests', 'Rework review requests'], ['openReworkRequests', 'Open rework reviews']].map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{String(summary[key])}</dd></div>)}</dl>}
  </section>
}
