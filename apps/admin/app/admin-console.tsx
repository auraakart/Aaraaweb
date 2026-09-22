'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { operatorConfirm, operatorPrompt } from '../lib/operator-dialog'
import { api, type Session } from '../lib/admin-client'
import { AdminLogin } from './admin-login'
import { adminRoles, viewsForRole, type AdminView as View } from '../lib/admin-access'
import type { Activity, BillableUnit, Building, Gate, GateAudit, Invoice, Notice, Occupancy, Ownership, PaymentAudit, Person, ServiceBooking, ServiceCatalog, ServiceProvider, SosEvent, SosIncident, Ticket, Unit, WorkforceAssignment, WorkforceLeave, WorkforceRating } from '../lib/admin-domain-types'

export function AdminConsole(){
  const[session,setSession]=useState<Session|null>(null),[restoring,setRestoring]=useState(true),[view,setView]=useState<View>('overview')
  useEffect(()=>{const raw=sessionStorage.getItem('aaraagate.admin.session');if(!raw){setRestoring(false);return}try{const stored=JSON.parse(raw)as Session;api<Record<string,unknown>>('/auth/refresh',{method:'POST',body:JSON.stringify({sessionId:stored.sessionId,refreshToken:stored.refreshToken})}).then(next=>{const fresh={...stored,sessionId:String(next.sessionId),accessToken:String(next.accessToken),refreshToken:String(next.refreshToken)};if(!adminRoles.has(fresh.role)||viewsForRole(fresh.role).length===0)throw new Error('Stored role no longer has console access');sessionStorage.setItem('aaraagate.admin.session',JSON.stringify(fresh));setSession(fresh)}).catch(()=>sessionStorage.removeItem('aaraagate.admin.session')).finally(()=>setRestoring(false))}catch{sessionStorage.removeItem('aaraagate.admin.session');setRestoring(false)}},[])
  const accept=(next:Session)=>{const allowed=viewsForRole(next.role);if(!adminRoles.has(next.role)||allowed.length===0)throw new Error('This role does not have Admin or operations-console access');sessionStorage.setItem('aaraagate.admin.session',JSON.stringify(next));setView(allowed[0]);setSession(next)}
  const logout=async()=>{if(session)await api('/auth/logout',{method:'POST',body:JSON.stringify({sessionId:session.sessionId,refreshToken:session.refreshToken})}).catch(()=>undefined);sessionStorage.removeItem('aaraagate.admin.session');setSession(null)}
  if(restoring)return <div className="center">Restoring secure session…</div>;if(!session)return <AdminLogin onSession={accept}/>