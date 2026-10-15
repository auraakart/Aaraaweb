import { createRoot } from 'react-dom/client'
import { useRef, useState } from 'react'
import {
  PageShell, PageHeader, QueuePanel, DetailPanel, ReadinessPanel, StatusPill,
  FormField, SelectField, PrimaryButton, SecondaryButton, DangerButton,
  EmptyState, ErrorState, Timeline, EvidenceGrid, ActionBar,
} from '../../components/admin-ui'
import type { LoadState, Tone } from '../../components/admin-ui'
// Match application stylesheet order so legacy selector collisions are exercised.
import '../../app/globals.css'
import '../../app/brand-tokens.css'
import '../../app/admin-navigation.css'
import '../../app/admin-shell.css'
import '../../app/property-workspace.css'

function Fixture() {
  const [state, setState] = useState<LoadState>('ready')
  const [selected, setSelected] = useState('Ticket A')
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [priority, setPriority] = useState('normal')
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(0)
  const [confirmed, setConfirmed] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [fieldError, setFieldError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const select = useRef<HTMLSelectElement>(null)
  return <PageShell>
    <PageHeader title="Admin component reference" context="Aaraagate · Society operations"
      description="Shared controls for consistent, accessible workflows." actions={<a href="#workspace">Skip to workspace</a>} />
    <SelectField label="Preview state" value={state} onChange={e => setState(e.target.value as LoadState)}>
      <option value="ready">Ready</option><option value="loading">Loading</option><option value="empty">Empty</option><option value="error">Error</option>
    </SelectField>
    <div id="workspace">
      <PageShell.Columns>
        <QueuePanel title="Prioritized queue" count={2} state={state}
          empty={<EmptyState title="No matching tickets" description="Change filters to see other tickets." />}
          error={<ErrorState title="Queue unavailable" action={<SecondaryButton onClick={() => setState('ready')}>Retry queue</SecondaryButton>} />}>
          <ActionBar label="Choose ticket">{['Ticket A', 'Ticket B with a long description for narrow screens'].map(title =>
            <SecondaryButton key={title} aria-pressed={selected === title} onClick={() => setSelected(title)}>{title}</SecondaryButton>)}</ActionBar>
        </QueuePanel>
        <DetailPanel title="Selected ticket" state={state} empty={<EmptyState title="Select a ticket" />}>
          <p>{selected}</p>
          <div>{(['neutral', 'info', 'success', 'warning', 'danger'] as Tone[]).map(tone => <StatusPill key={tone} label={tone} tone={tone} />)}<StatusPill label="Unmapped state" /></div>
          <ReadinessPanel title="Service readiness" status={{ label: 'Action required', tone: 'warning' }}
            blockers={['Assignment missing']} nextActions={['Assign an active reviewer']}
            boundary="Describes available evidence; actions require server authorization."
            checks={<EvidenceGrid items={[{ id: 'owner', label: 'Assignee', value: null }, { id: 'count', label: 'Escalations', value: 0 }]} />} />
          <ReadinessPanel title="Unknown readiness" />
          <ReadinessPanel title="Failed readiness" state="error" status={{ label: 'READY', tone: 'success' }} />
          <ReadinessPanel title="Loading readiness" state="loading" status={{ label: 'READY', tone: 'success' }} />
          <form onSubmit={e => { e.preventDefault(); setPending(true); setSaved(n => n + 1) }}>
            <FormField ref={input} label="Assignee" hint="Choose an active member." error={fieldError}
              aria-describedby="external-hint" required value={name} onChange={e => setName(e.target.value)} />
            <p id="external-hint">Society membership is checked on save.</p>
            <FormField ref={textarea} multiline label="Internal note" value={note} onChange={e => setNote(e.target.value)} maxLength={1000} />
            <SelectField ref={select} label="Priority" value={priority} onChange={e => setPriority(e.target.value)} hint="Operational priority.">
              <option value="normal">Normal</option><option value="high">High</option>
            </SelectField>
            <ActionBar feedback={`Submissions: ${saved}`}>
              <PrimaryButton type="submit" loading={pending} loadingLabel="Saving assignment…">Save assignment</PrimaryButton>
              <SecondaryButton onClick={() => { setFieldError('Select an eligible reviewer.'); input.current?.focus() }}>Validate reviewer</SecondaryButton>
              <SecondaryButton onClick={() => { setPending(false); textarea.current?.focus() }}>Finish request</SecondaryButton>
              <SecondaryButton onClick={() => select.current?.focus()}>Focus priority</SecondaryButton>
            </ActionBar>
          </form>
          <FormField type="checkbox" label="I reviewed the erasure plan" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
          <DangerButton disabled={!confirmed} onClick={() => { setDeleted(true); setConfirmed(false) }}>Execute erasure</DangerButton>
          {deleted && <p role="status">Erasure requested</p>}
          <Timeline events={[{ id: '2', label: 'Assigned', actor: 'Reviewer', dateTime: '2026-09-19T03:00:00Z', timeLabel: '19 September 2026, 08:30', evidence: 'Internal evidence retained' },
            { id: '1', label: 'Created', timeLabel: '19 September 2026, 08:00' }]} />
          <Timeline events={[]} label="Empty history" />
        </DetailPanel>
      </PageShell.Columns>
    </div>
  </PageShell>
}

createRoot(document.getElementById('root')!).render(<Fixture />)
