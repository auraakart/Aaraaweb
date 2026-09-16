'use client'

import { useEffect, useMemo, useState } from 'react'

const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
const reportRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','FACILITY_MANAGER','ACCOUNTANT'])
const financeRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','ACCOUNTANT'])
const governanceRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER'])
const societySetupRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN'])
const occupancyRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER','COMMITTEE_MEMBER'])
const facilitiesRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER','COMMITTEE_MEMBER'])
const utilitiesRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER','COMMITTEE_MEMBER'])
const marketplaceRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER'])
const amenityRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER'])
const parcelRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER'])
const noticeRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','FACILITY_MANAGER'])
const emergencyRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','FACILITY_MANAGER','SECURITY_SUPERVISOR'])
const documentRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','FACILITY_MANAGER','ACCOUNTANT'])
const vendorRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','FACILITY_MANAGER'])
const privacyRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN'])

type StoredSession={role?:string;accessToken?:string}
type CurrentEntitlements={enabledFeatures?:string[]}
type NavItem={href:string;label:string;description:string}
type NavSection={label:string;items:NavItem[]}

function add(section:NavSection,item:NavItem){section.items.push(item)}

export function AdminShortcuts(){
  const[role,setRole]=useState('')
  const[features,setFeatures]=useState<Set<string>>(new Set())
  const[open,setOpen]=useState(false)

  useEffect(()=>{
    let active=true
    const load=async()=>{try{
      const raw=sessionStorage.getItem('aaraagate.admin.session');if(!raw)return
      const session=JSON.parse(raw) as StoredSession
      const nextRole=session.role??''
      if(!active)return
      setRole(nextRole)
      if(!session.accessToken)return
      const response=await fetch(`${base}/api/v1/entitlements/current`,{headers:{Accept:'application/json',Authorization:`Bearer ${session.accessToken}`}})
      if(!response.ok)return
      const body=await response.json() as CurrentEntitlements
      if(active)setFeatures(new Set(body.enabledFeatures??[]))
    }catch{if(active){setRole('');setFeatures(new Set())}}}
    void load()
    return()=>{active=false}
  },[])

  const sections=useMemo(()=>{
    const operations:NavSection={label:'Operations',items:[]}
    const property:NavSection={label:'Property & community',items:[]}
    const finance:NavSection={label:'Finance & reporting',items:[]}
    const platform:NavSection={label:'Platform controls',items:[]}

    if(occupancyRoles.has(role))add(property,{href:'/occupancy-lifecycle',label:'Move-in / move-out',description:'Manage occupancy lifecycle and handovers'})
    if(role==='SOCIETY_ADMIN')add(property,{href:'/household-approvals',label:'Household approvals',description:'Review resident household requests'})
    if(societySetupRoles.has(role)){
      add(property,{href:'/property',label:'Property setup',description:'Buildings, units and society structure'})
      add(property,{href:'/roles',label:'People & roles',description:'Administrative memberships and access'})
      add(property,{href:'/parking',label:'Parking',description:'Parking inventory and assignments'})
    }
    if(governanceRoles.has(role)){
      add(property,{href:'/governance',label:'Governance',description:'Committee and governance operations'})
      add(property,{href:'/governance/polls',label:'Community polls',description:'Create and manage resident polls'})
    }
    if(documentRoles.has(role))add(property,{href:'/documents',label:'Documents',description:'Society document operations'})

    if(facilitiesRoles.has(role)){
      add(operations,{href:'/facilities',label:'Facilities ops',description:'Assets, issues and facility workflows'})
      add(operations,{href:'/facilities/health',label:'Facilities health',description:'Operational health overview'})
      add(operations,{href:'/facilities/preventive',label:'Preventive maintenance',description:'Scheduled maintenance activities'})
      add(operations,{href:'/facilities/contracts',label:'AMC & evidence',description:'Contracts and maintenance evidence'})
      add(operations,{href:'/facilities/alerts',label:'Facilities alerts',description:'Operational exceptions and alerts'})
    }
    if(emergencyRoles.has(role)&&features.has('SOS'))add(operations,{href:'/emergency-operations',label:'Emergency control room',description:'Acknowledge and resolve SOS incidents'})
    if(vendorRoles.has(role))add(operations,{href:'/society-vendors',label:'Vendors & procurement',description:'Vendor relationships and procurement'})
    if(utilitiesRoles.has(role))add(operations,{href:'/utilities',label:'Meter & utilities',description:'Metering and utility operations'})
    if(parcelRoles.has(role))add(operations,{href:'/parcels',label:'Parcel desk',description:'Parcel receiving and handover'})
    if(amenityRoles.has(role)&&features.has('AMENITIES'))add(operations,{href:'/amenities',label:'Amenities',description:'Amenity configuration and bookings'})
    if(noticeRoles.has(role)&&features.has('NOTICES'))add(operations,{href:'/notices/metrics',label:'Notice metrics',description:'Announcement delivery and engagement'})
    if(marketplaceRoles.has(role)&&features.has('HOUSEHOLD_SERVICES'))add(operations,{href:'/marketplace-control',label:'Marketplace controls',description:'Society marketplace operations'})
    if(privacyRoles.has(role))add(operations,{href:'/privacy-operations',label:'Privacy operations',description:'Privacy requests and operational controls'})

    if(reportRoles.has(role)&&features.has('ADVANCED_REPORTS'))add(finance,{href:'/reports',label:'Reports',description:'Operational and management reporting'})
    if(financeRoles.has(role)&&features.has('SOCIETY_ACCOUNTING')){
      add(finance,{href:'/finance',label:'Finance',description:'Society financial overview'})
      add(finance,{href:'/finance/operations',label:'Finance ops',description:'Accounting operations and workflows'})
      add(finance,{href:'/finance/reconciliation',label:'Reconciliation',description:'Payment and ledger reconciliation'})
    }

    if(role==='SUPER_ADMIN'){
      add(platform,{href:'/platform/providers',label:'Provider verification',description:'Verify external service providers'})
      add(platform,{href:'/platform/provider-trust',label:'Provider trust',description:'Trust and provider quality controls'})
      add(platform,{href:'/marketplace-control/commercial',label:'Commercial controls',description:'Marketplace commissions and commercial policy'})
      add(platform,{href:'/marketplace-control/operations',label:'Services operations',description:'Cross-society service operations'})
      add(platform,{href:'/platform',label:'Platform',description:'Aaraagate platform administration'})
    }

    return [operations,property,finance,platform].filter(section=>section.items.length>0)
  },[features,role])

  if(!role||sections.length===0)return null

  return <div className="managementNav">
    <button className="managementNavTrigger" type="button" aria-expanded={open} aria-controls="management-nav-panel" onClick={()=>setOpen(value=>!value)}>
      <span>Management</span><small>{sections.reduce((count,section)=>count+section.items.length,0)} tools</small>
    </button>
    {open&&<div className="managementNavBackdrop" onClick={()=>setOpen(false)}/>} 
    <aside id="management-nav-panel" className={`managementNavPanel ${open?'open':''}`} aria-hidden={!open}>
      <div className="managementNavHeader"><div><small>Admin workspace</small><strong>Management tools</strong></div><button type="button" aria-label="Close management navigation" onClick={()=>setOpen(false)}>×</button></div>
      <div className="managementNavSections">{sections.map(section=><section key={section.label}><h2>{section.label}</h2><div className="managementNavLinks">{section.items.map(item=><a key={item.href} href={item.href}><strong>{item.label}</strong><span>{item.description}</span></a>)}</div></section>)}</div>
    </aside>
  </div>
}
