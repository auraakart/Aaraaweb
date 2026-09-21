'use client'

import {useEffect,useMemo,useRef,useState} from 'react'
import { DetailPanel, EmptyState, ErrorState, EvidenceGrid, PageHeader, PageShell, QueuePanel, ReadinessPanel, StatusPill, Timeline } from '../../../components/admin-ui'

type Session={accessToken:string;role:string;societyName?:string}
type Meeting={id:string;meetingType:string;status:'SCHEDULED'|'HELD'|'CANCELLED';title:string;scheduledAt:string;heldAt?:string|null;quorumRequired?:number|null;quorumPresent?:number|null;quorumRuleReference?:string|null;byeLawReference?:string|null;minutesSummary?:string|null}
type Resolution={id:string;status:'PROPOSED'|'PASSED'|'REJECTED'|'WITHDRAWN';title:string;approvalRequired?:number|null;approvalRecorded?:number|null;approvalRuleReference?:string|null;byeLawReference?:string|null}
type Evidence={id:string;eventType:string;summary:string;createdAt:string}
type Detail=Meeting&{agenda:Array<{id:string}>;resolutions:Resolution[];actions:Array<{id:string;ownerUserId?:string|null;dueAt?:string|null}>;evidence:Evidence[]}
const base=process.env.NEXT_PUBLIC_API_BASE_URL??'http://localhost:3000'
const readRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER'])
function getSession():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw):null}catch{return null}}
async function api<T>(s:Session,path:string):Promise<T>{const r=await fetch(`${base}/api/v1${path}`,{headers:{Authorization:`Bearer ${s.accessToken}`}});const body=await r.json().catch(()=>null);if(!r.ok)throw new Error(body?.message??`Request failed (${r.status})`);return body as T}
const yes=(v:boolean)=>v?'Recorded':'Missing'
const human=(v:string)=>v.replaceAll('_',' ')

export default function GovernanceReadinessPage(){
 const s=typeof window==='undefined'?null:getSession(),canRead=!!s&&readRoles.has(s.role)
 const[meetings,setMeetings]=useState<Meeting[]>([]),[selected,setSelected]=useState<Detail|null>(null),[loading,setLoading]=useState(true),[detailLoading,setDetailLoading]=useState(false),[error,setError]=useState(''),[detailError,setDetailError]=useState('')
 const detailRequest=useRef(0)

 useEffect(()=>{
   if(!s||!canRead)return
   setLoading(true);setError('')
   api<Meeting[]>(s,'/governance/meetings').then(setMeetings).catch(e=>setError(e instanceof Error?e.message:'Could not load governance meetings')).finally(()=>setLoading(false))
 },[])

 async function inspect(id:string){
   if(!s)return
   const requestId=++detailRequest.current
   setDetailLoading(true);setDetailError('')
   try{const detail=await api<Detail>(s,`/governance/meetings/${id}`);if(requestId===detailRequest.current)setSelected(detail)}
   catch(e){if(requestId===detailRequest.current)setDetailError(e instanceof Error?e.message:'Could not load meeting evidence')}
   finally{if(requestId===detailRequest.current)setDetailLoading(false)}
 }

 const summary=useMemo(()=>{if(!selected)return null;const qConfigured=selected.quorumRequired!=null,qRecorded=selected.quorumPresent!=null;const approvalConfigured=selected.resolutions.filter(r=>r.approvalRequired!=null).length,approvalRecorded=selected.resolutions.filter(r=>r.approvalRecorded!=null).length;const ruleRefs=selected.resolutions.filter(r=>!!r.approvalRuleReference).length,byeRefs=selected.resolutions.filter(r=>!!r.byeLawReference).length;return{
  outcome:selected.status!=='SCHEDULED',
  heldAt:!!selected.heldAt,
  minutes:!!selected.minutesSummary?.trim(),
  quorumConfigured:qConfigured,
  quorumRecorded:qRecorded,
  quorumComparison:qConfigured&&qRecorded?(selected.quorumPresent!>=selected.quorumRequired!?'Recorded count meets/exceeds configured count':'Recorded count is below configured count'):'Not comparable',
  meetingRule:!!selected.quorumRuleReference,
  meetingByeLaw:!!selected.byeLawReference,
  resolutionCount:selected.resolutions.length,
  unresolvedResolutions:selected.resolutions.filter(r=>r.status==='PROPOSED').length,
  approvalConfigured,approvalRecorded,ruleRefs,byeRefs,
  evidenceEvents:selected.evidence.length,
  actions:selected.actions.length,
  unownedActions:selected.actions.filter(a=>!a.ownerUserId).length
 }},[selected])

 if(!s||!canRead)return <PageShell><PageHeader title="Governance access required" actions={<a href="/governance">Return to governance</a>}/></PageShell>

 const queueState=loading?'loading':error?'error':meetings.length===0?'empty':'ready'
 const detailState=detailLoading?'loading':detailError?'error':!selected?'empty':'ready'
 const blockers=summary?[
   ...(!summary.outcome?['Meeting outcome is not yet recorded.']:[]),
   ...(!summary.minutes?['Minutes summary is missing from repository evidence.']:[]),
   ...(summary.unresolvedResolutions>0?[`${summary.unresolvedResolutions} proposed resolution${summary.unresolvedResolutions===1?' remains':'s remain'} unresolved.`]:[]),
   ...(summary.unownedActions>0?[`${summary.unownedActions} action item${summary.unownedActions===1?' is':'s are'} unowned.`]:[]),
 ]:[]

 return <PageShell>
  <PageHeader
    context={`${s.societyName??'Current society'} · ${human(s.role)}`}
    title="Governance readiness & closure evidence"
    description="Descriptive evidence assembled from repository records. This view does not determine legal validity, statutory compliance, quorum law, or resolution validity."
    actions={<a href="/governance">← Governance workspace</a>}
  />
  {error&&<ErrorState title="Governance readiness unavailable" description={error}/>}
  <PageShell.Columns>
   <QueuePanel
     title="Meetings"
     count={meetings.length}
     state={queueState}
     loadingLabel="Loading governance meetings…"
     error={<ErrorState title="Governance meetings unavailable" description={error}/>}
     empty={<EmptyState title="No governance meetings"/>}
   >
    <div style={queueList}>{meetings.map(m=><button key={m.id} type="button" aria-pressed={selected?.id===m.id} onClick={()=>void inspect(m.id)} style={{...meetingButton,...(selected?.id===m.id?selectedMeeting:{})}}>
      <span><strong>{m.meetingType} · {m.title}</strong><br/><small>{new Date(m.scheduledAt).toLocaleString('en-IN')}</small></span>
      <StatusPill label={human(m.status)} tone={m.status==='HELD'?'success':m.status==='CANCELLED'?'danger':'info'}/>
    </button>)}</div>
   </QueuePanel>

   <DetailPanel
     title={selected?`${selected.meetingType} · ${selected.title}`:'Evidence summary'}
     state={detailState}
     loadingLabel="Loading closure evidence…"
     error={<ErrorState title="Meeting evidence unavailable" description={detailError}/>}
     empty={<EmptyState title="Select a meeting" description="Choose a governance meeting to inspect operational completeness evidence."/>}
     actions={selected?<StatusPill label={human(selected.status)} tone={selected.status==='HELD'?'success':selected.status==='CANCELLED'?'danger':'info'}/>:undefined}
   >
    {selected&&summary&&<>
      <ReadinessPanel
        title="Operational completeness"
        state="ready"
        status={{label:blockers.length===0?'EVIDENCE COMPLETE':'EVIDENCE GAPS',tone:blockers.length===0?'success':'warning'}}
        blockers={blockers}
        boundary="Use this as an operational completeness checklist only. State-specific law, registered bye-laws, notices, voting rules and external records remain authoritative outside this repository."
        checks={<EvidenceGrid items={[
          {id:'outcome',label:'Outcome',value:yes(summary.outcome)},
          {id:'held-at',label:'Held timestamp',value:yes(summary.heldAt)},
          {id:'minutes',label:'Minutes',value:yes(summary.minutes)},
          {id:'quorum-configured',label:'Quorum configured',value:yes(summary.quorumConfigured)},
          {id:'quorum-recorded',label:'Quorum recorded',value:yes(summary.quorumRecorded)},
          {id:'count-comparison',label:'Count comparison',value:summary.quorumComparison},
          {id:'quorum-rule',label:'Quorum rule reference',value:yes(summary.meetingRule)},
          {id:'meeting-bye-law',label:'Meeting bye-law reference',value:yes(summary.meetingByeLaw)},
          {id:'resolutions',label:'Resolutions',value:summary.resolutionCount},
          {id:'proposed',label:'Proposed resolutions',value:summary.unresolvedResolutions},
          {id:'approvals',label:'Approval configured / recorded',value:`${summary.approvalConfigured} / ${summary.approvalRecorded}`},
          {id:'resolution-rules',label:'Resolution rule refs',value:summary.ruleRefs},
          {id:'resolution-bye-laws',label:'Resolution bye-law refs',value:summary.byeRefs},
          {id:'actions',label:'Action items / unowned',value:`${summary.actions} / ${summary.unownedActions}`},
          {id:'evidence',label:'Evidence events',value:summary.evidenceEvents},
        ]}/>}
      />
      <section><h3>Closure evidence trail</h3><Timeline label="Governance closure evidence" emptyLabel="No evidence events recorded." events={selected.evidence.map(e=>({id:e.id,label:human(e.eventType),dateTime:e.createdAt,timeLabel:new Date(e.createdAt).toLocaleString('en-IN'),evidence:<div>{e.summary}</div>}))}/></section>
    </>}
   </DetailPanel>
  </PageShell.Columns>
 </PageShell>
}
const queueList={display:'grid',gap:8} as const
const meetingButton={display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',width:'100%',padding:12,border:'1px solid var(--line,#d5e8eb)',borderRadius:12,background:'var(--surface,#fff)',color:'var(--ink,#17323a)',textAlign:'left',font:'inherit',cursor:'pointer'} as const
const selectedMeeting={background:'var(--neutral-soft,#eef6f7)',borderColor:'var(--brand,#05879a)',boxShadow:'inset 3px 0 0 var(--brand,#05879a)'} as const
