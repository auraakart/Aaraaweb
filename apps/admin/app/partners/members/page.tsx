'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DangerButton, DetailPanel, EmptyState, ErrorState, FormField, PageHeader, PageShell, PrimaryButton, SecondaryButton, SelectField, StatusPill } from '../../../components/admin-ui'
import { api, type Session } from '../../../lib/admin-client'
import { operatorConfirm } from '../../../lib/operator-dialog'
import { canReadMembers, parsePartnerMembers, parseWorkspaces, partnerSessionKey, readPartnerSession, type Workspace } from '../../../lib/admin-partner'
import { isCurrentMemberOperator, parsePendingInvitations, validPartnerUuid, type MemberRole, type PendingInvitation } from '../../../lib/admin-partner-member'

type Member=ReturnType<typeof parsePartnerMembers>[number]
const roles:MemberRole[]=['OWNER','BRAND_MANAGER','COMMERCIAL_ADMIN','SUPPORT']
const errorText=(error:unknown)=>error instanceof Error?error.message:'Partner membership action unavailable'
export default function PartnerMembersPage(){
 const [session,setSession]=useState<Session|null>(null),[workspaces,setWorkspaces]=useState<Workspace[]>([]),[selected,setSelected]=useState('')
 const [members,setMembers]=useState<Member[]|null>(null),[inbox,setInbox]=useState<PendingInvitation[]>([])
 const [roleDrafts,setRoleDrafts]=useState<Record<string,MemberRole>>({}),[target,setTarget]=useState(''),[invitedRole,setInvitedRole]=useState<MemberRole>('BRAND_MANAGER')
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const generation=useRef(0),abort=useRef<AbortController|null>(null)
 const load=useCallback(async(s:Session,preferred:string)=>{
  const run=++generation.current,key=partnerSessionKey(s);abort.current?.abort()
  const controller=new AbortController();abort.current=controller
  const current=()=>run===generation.current&&key===partnerSessionKey(readPartnerSession())&&!controller.signal.aborted
  setLoading(true);setError('');setMembers(null);setWorkspaces([]);setInbox([]);setRoleDrafts({})
  try{
   const init={signal:controller.signal,cache:'no-store' as const}
   const [rawWorkspaces,rawInvites]=await Promise.all([api<unknown>('/partners/workspaces',init,s),api<unknown>('/partners/my-invitations',init,s)])
   if(!current())return
   const discovered=parseWorkspaces(rawWorkspaces),invites=parsePendingInvitations(rawInvites)
   const workspace=discovered.workspaces.find(w=>w.id===preferred)??discovered.workspaces[0]
   setWorkspaces(discovered.workspaces);setInbox(invites);setSelected(workspace?.id??'')
   if(!workspace||!canReadMembers(workspace))return
   const list=parsePartnerMembers(await api<unknown>(`/partners/${workspace.id}/members`,init,s))
   if(!current())return
   setMembers(list);setRoleDrafts(Object.fromEntries(list.map(member=>[member.id,member.role])))
  }catch(e){if(current())setError(errorText(e))}
  finally{if(current())setLoading(false)}
 },[])
 useEffect(()=>{
  const sync=()=>{const s=readPartnerSession();setSession(s);setNotice('');if(s)void load(s,'');else{++generation.current;abort.current?.abort();setWorkspaces([]);setMembers(null);setInbox([]);setSelected('');setLoading(false)}}
  sync();window.addEventListener('storage',sync);window.addEventListener('focus',sync)
  return()=>{++generation.current;abort.current?.abort();window.removeEventListener('storage',sync);window.removeEventListener('focus',sync)}
 },[load])
 const workspace=workspaces.find(w=>w.id===selected)
 const isOwner=Boolean(workspace&&isCurrentMemberOperator(workspace.roles))
 const perform=async(action:(s:Session)=>Promise<unknown>,success:string)=>{
  if(!session||partnerSessionKey(session)!==partnerSessionKey(readPartnerSession())||saving||loading)return
  setSaving(true);setError('');setNotice('')
  try{await action(session);if(partnerSessionKey(session)===partnerSessionKey(readPartnerSession())){setNotice(success);await load(session,selected)}}
  catch(e){if(partnerSessionKey(session)===partnerSessionKey(readPartnerSession()))setError(errorText(e))}
  finally{setSaving(false)}
 }
 const memberRole=(m:Member)=>roleDrafts[m.id]??m.role
 return <PageShell>
  <PageHeader title="Partner membership" description="Commercial team permissions only. Partner access never grants society operations." actions={<><a href="/partners">Partner portfolio</a><SecondaryButton disabled={!session||saving||loading} onClick={()=>session&&void load(session,selected)}>Refresh</SecondaryButton></>}/>
  {error&&<ErrorState title="Partner membership unavailable" description={error}/>}
  {notice&&<p role="status">{notice}</p>}
  {loading?<p role="status">Loading partner membership…</p>:!session?<EmptyState title="Sign in to continue" description="Use your existing authorized Aaraagate account."/>:null}
  {!!workspaces.length&&<SelectField label="Partner workspace" value={selected} disabled={saving||loading} onChange={e=>session&&void load(session,e.target.value)}>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</SelectField>}
  {!loading&&session&&!workspaces.length&&<p>You have no active partner management workspace.</p>}
  {session&&!loading&&<PageShell.Columns>
   <DetailPanel title="Invitations sent to you">
    {inbox.length===0?<p>No pending invitations.</p>:inbox.map(inv=><article key={inv.id}>
     <h3>{inv.partnerName}</h3><StatusPill label={inv.role.replaceAll('_',' ')}/><p>Expires {new Date(inv.expiresAt).toLocaleDateString('en-IN')}</p>
     <PrimaryButton disabled={saving} onClick={()=>void perform((s)=>api(`/partners/${inv.partnerId}/invitations/${inv.id}/respond`,{method:'POST',body:JSON.stringify({accept:true})},s),'Invitation accepted')}>Accept</PrimaryButton>{' '}
     <SecondaryButton disabled={saving} onClick={()=>void perform((s)=>api(`/partners/${inv.partnerId}/invitations/${inv.id}/respond`,{method:'POST',body:JSON.stringify({accept:false})},s),'Invitation declined')}>Decline</SecondaryButton>
    </article>)}
   </DetailPanel>
   <DetailPanel title="Current team roles">
    {members===null?<p>Only authorized commercial administrators may view partner member roles.</p>:members.length===0?<p>No active member roles.</p>:members.map((m,index)=><article key={m.id}>
     <h3>Role assignment {index+1}</h3><StatusPill label={m.role.replaceAll('_',' ')}/>
     {isOwner&&<><SelectField label={`New role for assignment ${index+1}`} value={memberRole(m)} disabled={saving} onChange={e=>setRoleDrafts(old=>({...old,[m.id]:e.target.value as MemberRole}))}>{roles.map(role=><option key={role} value={role}>{role.replaceAll('_',' ')}</option>)}</SelectField>
     <SecondaryButton disabled={saving||memberRole(m)===m.role} onClick={()=>{void operatorConfirm('Change this partner role?').then(approved=>{if(approved)void perform((s)=>api(`/partners/${selected}/members/${m.id}/role`,{method:'PATCH',body:JSON.stringify({role:memberRole(m)})},s),'Role changed')})}}>Change role</SecondaryButton>{' '}
     <DangerButton disabled={saving} onClick={()=>{void operatorConfirm('Revoke this partner membership?').then(approved=>{if(approved)void perform((s)=>api(`/partners/${selected}/members/${m.id}`,{method:'DELETE'},s),'Member revoked')})}}>Revoke role</DangerButton></>}
    </article>)}
    {members?.length===50&&<p>Showing the first 50 active roles.</p>}
   </DetailPanel>
   <DetailPanel title="Invite existing account">
    {isOwner?<><p>Use an existing Aaraagate user ID. Invitations do not share phone numbers, resident records or gate details.</p>
     <FormField label="Existing user ID" value={target} disabled={saving} onChange={e=>setTarget(e.target.value.trim())} placeholder="UUID of existing account"/>
     <SelectField label="Commercial role" value={invitedRole} disabled={saving} onChange={e=>setInvitedRole(e.target.value as MemberRole)}>{roles.map(role=><option key={role} value={role}>{role.replaceAll('_',' ')}</option>)}</SelectField>
     <PrimaryButton disabled={saving||!validPartnerUuid(target)} onClick={()=>void perform((s)=>api(`/partners/${selected}/invitations`,{method:'POST',body:JSON.stringify({userId:target,role:invitedRole,idempotencyKey:crypto.randomUUID()})},s),'Invitation created')}>Invite member</PrimaryButton>
    </>:<p>Only an active partner owner can invite members or change roles.</p>}
   </DetailPanel>
  </PageShell.Columns>}
 </PageShell>
}
