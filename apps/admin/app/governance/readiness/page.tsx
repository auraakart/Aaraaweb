'use client';
import {useEffect,useMemo,useState} from 'react';

type Session={accessToken:string;role:string;societyName?:string};
type Meeting={id:string;meetingType:string;status:'SCHEDULED'|'HELD'|'CANCELLED';title:string;scheduledAt:string;heldAt?:string|null;quorumRequired?:number|null;quorumPresent?:number|null;quorumRuleReference?:string|null;byeLawReference?:string|null;minutesSummary?:string|null};
type Resolution={id:string;status:'PROPOSED'|'PASSED'|'REJECTED'|'WITHDRAWN';title:string;approvalRequired?:number|null;approvalRecorded?:number|null;approvalRuleReference?:string|null;byeLawReference?:string|null};
type Evidence={id:string;eventType:string;summary:string;createdAt:string};
type Detail=Meeting&{agenda:Array<{id:string}>;resolutions:Resolution[];actions:Array<{id:string;ownerUserId?:string|null;dueAt?:string|null}>;evidence:Evidence[]};
const base=process.env.NEXT_PUBLIC_API_BASE_URL??'http://localhost:3000';
const readRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER']);
function getSession():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw):null}catch{return null}}
async function api<T>(s:Session,path:string):Promise<T>{const r=await fetch(`${base}/api/v1${path}`,{headers:{Authorization:`Bearer ${s.accessToken}`}});const body=await r.json().catch(()=>null);if(!r.ok)throw new Error(body?.message??`Request failed (${r.status})`);return body as T}
const yes=(v:boolean)=>v?'Recorded':'Missing';
export default function GovernanceReadinessPage(){
 const s=typeof window==='undefined'?null:getSession(),canRead=!!s&&readRoles.has(s.role);
 const[meetings,setMeetings]=useState<Meeting[]>([]),[selected,setSelected]=useState<Detail|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(!s||!canRead)return;setBusy(true);api<Meeting[]>(s,'/governance/meetings').then(setMeetings).catch(e=>setError(e instanceof Error?e.message:'Could not load governance meetings')).finally(()=>setBusy(false))},[]);
 async function inspect(id:string){if(!s)return;setBusy(true);setError('');try{setSelected(await api<Detail>(s,`/governance/meetings/${id}`))}catch(e){setError(e instanceof Error?e.message:'Could not load meeting evidence')}finally{setBusy(false)}}
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
 }},[selected]);
 if(!s||!canRead)return <main style={{padding:32}}><h1>Governance access required</h1><a href="/governance">Return to governance</a></main>;
 return <main style={{maxWidth:1180,margin:'0 auto',padding:'28px 22px 80px'}}><header><small>{s.societyName??'Current society'} · {s.role.replaceAll('_',' ')}</small><h1>Governance readiness & closure evidence</h1><p>Descriptive evidence assembled from repository records. This view does not determine legal validity, statutory compliance, quorum law, or resolution validity.</p><a href="/governance">← Governance workspace</a></header>{error&&<p style={errorBox}>{error}</p>}<section style={grid}><div style={panel}><div style={row}><h2 style={{margin:0}}>Meetings</h2><span>{busy?'Loading…':`${meetings.length} records`}</span></div>{meetings.length===0?<p>No governance meetings.</p>:meetings.map(m=><button key={m.id} onClick={()=>void inspect(m.id)} style={itemButton}><span><b>{m.meetingType} · {m.title}</b><br/><small>{m.status} · {new Date(m.scheduledAt).toLocaleString('en-IN')}</small></span><span>›</span></button>)}</div>{selected&&summary&&<div style={panel}><h2 style={{marginTop:0}}>Evidence summary</h2><dl style={details}><dt>Outcome</dt><dd>{yes(summary.outcome)}</dd><dt>Held timestamp</dt><dd>{yes(summary.heldAt)}</dd><dt>Minutes</dt><dd>{yes(summary.minutes)}</dd><dt>Quorum configured</dt><dd>{yes(summary.quorumConfigured)}</dd><dt>Quorum recorded</dt><dd>{yes(summary.quorumRecorded)}</dd><dt>Count comparison</dt><dd>{summary.quorumComparison}</dd><dt>Quorum rule reference</dt><dd>{yes(summary.meetingRule)}</dd><dt>Meeting bye-law reference</dt><dd>{yes(summary.meetingByeLaw)}</dd><dt>Resolutions</dt><dd>{summary.resolutionCount}</dd><dt>Proposed resolutions</dt><dd>{summary.unresolvedResolutions}</dd><dt>Approval configured / recorded</dt><dd>{summary.approvalConfigured} / {summary.approvalRecorded}</dd><dt>Resolution rule refs</dt><dd>{summary.ruleRefs}</dd><dt>Resolution bye-law refs</dt><dd>{summary.byeRefs}</dd><dt>Action items / unowned</dt><dd>{summary.actions} / {summary.unownedActions}</dd><dt>Evidence events</dt><dd>{summary.evidenceEvents}</dd></dl><p style={note}>Use this as an operational completeness checklist only. State-specific law, registered bye-laws, notices, voting rules and external records remain authoritative outside this repository.</p></div>}</section>{selected&&<section style={panel}><h2>Closure evidence trail</h2>{selected.evidence.length===0?<p>No evidence events recorded.</p>:selected.evidence.map(e=><div key={e.id} style={item}><span><b>{e.eventType}</b><br/><small>{e.summary}</small></span><small>{new Date(e.createdAt).toLocaleString('en-IN')}</small></div>)}</section>}</main>
}
const panel={background:'white',border:'1px solid #e5e7eb',borderRadius:16,padding:18,marginTop:18} as const,grid={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(360px,1fr))',gap:16} as const,row={display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'} as const,item={display:'flex',justifyContent:'space-between',gap:12,padding:'10px 0',borderBottom:'1px solid #e5e7eb'} as const,itemButton={...item,width:'100%',textAlign:'left',background:'transparent',borderTop:0,borderLeft:0,borderRight:0,cursor:'pointer'} as const,details={display:'grid',gridTemplateColumns:'220px 1fr',gap:'8px 12px'} as const,note={padding:12,background:'#f8fafc',borderRadius:10} as const,errorBox={padding:12,background:'#fee2e2',borderRadius:10} as const;
