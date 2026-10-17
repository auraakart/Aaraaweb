import {useEffect,useState} from 'react'
import {createRoot} from 'react-dom/client'
import SocietyOnboardingPage from '../../app/onboarding/page'
import {MigrationImportStager} from '../../app/migration/import-stager'
import type {Session} from '../../lib/admin-client'
import '../../app/globals.css'
import '../../app/brand-tokens.css'

const initial:Session={sessionId:'session-one',societyId:'society-one',role:'SOCIETY_ADMIN',societyName:'First society',accessToken:'fixture-token',refreshToken:'fixture-refresh'}
sessionStorage.setItem('aaraagate.admin.session',JSON.stringify(initial))
const requests:Array<{path:string;body:unknown;reply:(value:unknown,status?:number)=>void}>=[]
let created=0
const controls={
  requests,
  get created(){return created},
  switchSession(patch:Partial<Session>){
    const current=JSON.parse(sessionStorage.getItem('aaraagate.admin.session')!) as Session
    sessionStorage.setItem('aaraagate.admin.session',JSON.stringify({...current,...patch}))
    window.dispatchEvent(new Event('storage'))
  },
  reply(index:number,value:unknown,status=200){requests[index].reply(value,status)},
  plan(name:string){return{status:'ACTION_REQUIRED',repositoryReady:false,readySteps:0,totalSteps:1,blockingStepIds:['residents'],activation:{eligibleResidents:1,activatedResidents:0,activationPercent:0},steps:[{id:'residents',title:`${name} setup`,description:'Review resident setup.',href:'/residents',state:'REVIEW',evidence:`${name} records`,blockers:['RESIDENT_REVIEW'],nextActions:['Review residents']}],evaluatedAt:'2026-10-17T06:00:00Z',productionizationClaim:false,boundary:'Review required'}},
}
Object.assign(window,{adoption:controls})
window.fetch=async(input,init={})=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,window.location.origin)
  return new Promise<Response>(resolve=>requests.push({path:url.pathname,body:init.body?JSON.parse(String(init.body)):null,reply:(value,status=200)=>resolve(new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}}))}))
}
function Fixture(){
  const[session,setSession]=useState(initial)
  useEffect(()=>{const changed=()=>setSession(JSON.parse(sessionStorage.getItem('aaraagate.admin.session')!));window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed)},[])
  if(new URLSearchParams(location.search).get('mode')==='onboarding')return <SocietyOnboardingPage/>
  return <main style={{padding:24}}><h1>Migration import</h1><MigrationImportStager session={session} onBatchCreated={()=>created++}/></main>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
