'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DangerButton, DetailPanel, EmptyState, ErrorState, FormField, PageHeader, PageShell, PrimaryButton, SecondaryButton, SelectField, StatusPill } from '../../../components/admin-ui'
import { api, type Session } from '../../../lib/admin-client'
import { parseWorkspaces, partnerSessionKey, readPartnerSession, type Workspace } from '../../../lib/admin-partner'
import { canManagePartnerDomains, domainHostname, domainProofLabel, parseDomainChallenge, parseDomainClaims, validDomainChallenge, type DomainClaim } from '../../../lib/admin-partner-domain'
import { operatorConfirm } from '../../../lib/operator-dialog'

export default function PartnerDomainsPage() {
  const [session, setSession] = useState<Session | null>(null), [workspaces, setWorkspaces] = useState<Workspace[]>([]), [selected, setSelected] = useState('')
  const [claims, setClaims] = useState<DomainClaim[]>([]), [hasMore, setHasMore] = useState(false)
  const [hostname, setHostname] = useState(''), [reason, setReason] = useState(''), [proofs, setProofs] = useState<Record<string, string>>({})
  const [issued, setIssued] = useState<{ id: string; hostname: string; challenge: string } | null>(null)
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const generation = useRef(0), abort = useRef<AbortController | null>(null), keys = useRef(new Map<string, string>()), writing = useRef(false)
  const load = useCallback(async (s: Session, preferred: string) => {
    const run = ++generation.current, identity = partnerSessionKey(s)
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller
    const current = () => run === generation.current && identity === partnerSessionKey(readPartnerSession()) && !controller.signal.aborted
    setLoading(true); setError(''); setIssued(null); setProofs({}); setClaims([]); setHasMore(false); setWorkspaces([]); setNotice('')
    try {
      const init = { signal: controller.signal, cache: 'no-store' as const }
      const discovered = parseWorkspaces(await api('/partners/workspaces', init, s))
      if (!current()) return null
      const workspace = discovered.workspaces.find(value => value.id === preferred) ?? discovered.workspaces[0]
      setWorkspaces(discovered.workspaces); setSelected(workspace?.id ?? '')
      if (!workspace || !canManagePartnerDomains(workspace)) return null
      const list = parseDomainClaims(await api(`/partners/${workspace.id}/domains`, init, s))
      if (!current()) return null
      setClaims(list.claims); setHasMore(list.hasMore)
      return { workspace, claims: list.claims }
    } catch (failure) { if (current()) { setWorkspaces([]); setSelected(''); setError(failure instanceof Error ? failure.message : 'Domain management unavailable') }; return null }
    finally { if (current()) setLoading(false) }
  }, [])
  useEffect(() => {
    const sync = () => {
      const s = readPartnerSession(); setSession(s); keys.current.clear(); setHostname(''); setReason('')
      if (s) void load(s, '')
      else { ++generation.current; abort.current?.abort(); setWorkspaces([]); setSelected(''); setClaims([]); setProofs({}); setIssued(null); setNotice(''); setError(''); setLoading(false) }
    }
    sync(); window.addEventListener('storage', sync); window.addEventListener('focus', sync)
    return () => { ++generation.current; abort.current?.abort(); window.removeEventListener('storage', sync); window.removeEventListener('focus', sync) }
  }, [load])
  const workspace = workspaces.find(value => value.id === selected), owner = canManagePartnerDomains(workspace)
  const mutate = async (action: 'register' | 'verify' | 'revoke' | 'reissue', claim?: DomainClaim) => {
    if (!session || !owner || loading || writing.current || partnerSessionKey(session) !== partnerSessionKey(readPartnerSession())) return
    const s = session, partner = selected, run = generation.current, identity = partnerSessionKey(s)
    const current = () => run === generation.current && identity === partnerSessionKey(readPartnerSession())
    const payload = action === 'register' ? { hostname: hostname.trim().toLowerCase() } : action === 'verify' ? { challenge: proofs[claim!.id] ?? '' } : { expectedVersion: claim!.version, reason: reason.trim() }
    if (action === 'register' && !domainHostname(hostname.trim().toLowerCase()) || action === 'verify' && !validDomainChallenge(proofs[claim!.id] ?? '') ||
        (action === 'revoke' || action === 'reissue') && (reason.trim().length < 3 || reason.trim().length > 500)) return
    // Lock immediately, including while the confirmation dialog is open.
    writing.current = true; setSaving(true); setError('')
    try {
      if ((action === 'revoke' || action === 'reissue') && !await operatorConfirm(action === 'revoke' ? 'Revoke this domain claim and its host sessions?' : 'Replace DNS proof and invalidate existing host sessions?')) return
      if (!current()) return
      const fingerprint = JSON.stringify([identity, partner, action, claim?.id, payload])
      let key = keys.current.get(fingerprint)
      if (!key) { key = crypto.randomUUID(); keys.current.set(fingerprint, key) }
      const path = `/partners/${partner}/domains${action === 'register' ? '' : `/${claim!.id}/${action}`}`
      const result = await api(path, { method: 'POST', body: JSON.stringify(action === 'verify' ? payload : { ...payload, idempotencyKey: key }), cache: 'no-store', signal: abort.current?.signal }, s)
      if (!current()) return
      const proof = action === 'register' || action === 'reissue' ? parseDomainChallenge(result, claim?.id) : null
      const fresh = await load(s, partner)
      if (!fresh || fresh.workspace.id !== partner || identity !== partnerSessionKey(readPartnerSession())) return
      if (proof?.challenge) {
        const row = fresh.claims.find(value => value.id === proof.id)
        if (row) { setIssued({ id: row.id, hostname: row.hostname, challenge: proof.challenge }); setProofs({ [row.id]: proof.challenge }) }
      }
      setNotice(proof && !proof.challenge ? 'The action was already recorded. Its proof is not recoverable; issue a replacement with a reason.' :
        action === 'verify' ? 'DNS proof recorded. Production routing remains inactive.' : action === 'revoke' ? 'Domain claim revoked.' : 'DNS proof issued. Save it before leaving this page.')
    } catch (failure) { if (current()) setError(failure instanceof Error ? failure.message : 'Domain action unavailable') }
    finally { writing.current = false; setSaving(false) }
  }
  return <PageShell>
    <PageHeader title="Partner domains" description="Manage ownership proof for your partner domains. DNS proof does not activate production routing." actions={<><a href="/partners">Partner portfolio</a><SecondaryButton disabled={!session || saving || loading} onClick={() => session && void load(session, selected)}>Refresh</SecondaryButton></>} />
    {error && <ErrorState title="Domain management unavailable" description={error} />}{notice && <p role="status">{notice}</p>}
    {!session ? <EmptyState title="Sign in to continue" description="Use your partner account to manage domain claims." action={<a href="/partners/login">Partner sign in</a>} /> : <>
      <SelectField label="Partner workspace" value={selected} disabled={saving || loading} onChange={event => { setHostname(''); setReason(''); void load(session, event.target.value) }}>{workspaces.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</SelectField>
      {loading ? <p role="status">Loading domain claims…</p> : !owner ? <EmptyState title="Partner owner access required" description="Only an active owner can read or change domain claims." /> : <>
        <DetailPanel title="Register a domain"><FormField label="Domain hostname" value={hostname} disabled={saving} onChange={event => setHostname(event.target.value)} placeholder="portal.yourcompany.in" hint="Enter a hostname without https://, a path or a port." />
          <PrimaryButton disabled={saving || !domainHostname(hostname.trim().toLowerCase())} onClick={() => void mutate('register')}>Register domain</PrimaryButton></DetailPanel>
        {issued && <DetailPanel title="Save your DNS proof"><p>This proof is shown once and clears on refresh or workspace change.</p>
          <FormField label="DNS TXT record name" readOnly value={`_aaraagate-challenge.${issued.hostname}`} /><FormField label="DNS TXT record value" readOnly value={`aaraagate-domain-verification=${issued.challenge}`} />
          <p>Ask your domain administrator to add this TXT record, then verify the matching claim below.</p></DetailPanel>}
        <DetailPanel title="Domain claims"><FormField label="Reason for revocation or proof replacement" multiline maxLength={500} value={reason} disabled={saving} onChange={event => setReason(event.target.value)} />
          {claims.length === 0 && <p>No domain claims registered.</p>}{claims.map(claim => <article key={claim.id}><h3>{claim.hostname}</h3><StatusPill label={domainProofLabel(claim)} />
            {claim.verifiedUntil && <p>DNS proof expires {new Date(claim.verifiedUntil).toLocaleString('en-IN')}</p>}
            {claim.status === 'PENDING' && <><FormField label={`DNS proof for ${claim.hostname}`} value={proofs[claim.id] ?? ''} maxLength={64} autoComplete="off" disabled={saving} onChange={event => setProofs(old => ({ ...old, [claim.id]: event.target.value.trim() }))} />
              <PrimaryButton disabled={saving || !validDomainChallenge(proofs[claim.id] ?? '')} onClick={() => void mutate('verify', claim)}>Verify {claim.hostname}</PrimaryButton></>}
            <SecondaryButton disabled={saving || reason.trim().length < 3} onClick={() => void mutate('reissue', claim)}>Replace proof for {claim.hostname}</SecondaryButton>{' '}
            <DangerButton disabled={saving || claim.status === 'REVOKED' || reason.trim().length < 3} onClick={() => void mutate('revoke', claim)}>Revoke {claim.hostname}</DangerButton>
          </article>)}{hasMore && <p>Showing the first 50 domain claims. Contact your administrator for the remaining records.</p>}
        </DetailPanel></>}
    </>}
  </PageShell>
}
