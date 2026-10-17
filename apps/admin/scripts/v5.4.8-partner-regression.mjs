import assert from 'node:assert/strict'
import { parseWorkspaces,parsePortfolio,parsePartnerMembers,canReadMembers,partnerSessionKey } from '../lib/admin-partner.ts'
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',c='33333333-3333-4333-8333-333333333333'
const raw={memberships:[{id:b,role:'BRAND_MANAGER',partner:{id:a,displayName:'Partner A'}}],hasMore:false}
const parsed=parseWorkspaces(raw);assert.equal(canReadMembers(parsed.workspaces[0]),false)
assert.equal(canReadMembers({...parsed.workspaces[0],roles:['OWNER']}),true)
assert.equal(parseWorkspaces({...raw,memberships:[...raw.memberships,{id:c,role:'OWNER',partner:raw.memberships[0].partner}]}).workspaces.length,1)
for(const change of [r=>r.memberships[0].role='SUPPORT',r=>r.memberships[0].partner.id='bad',r=>r.hasMore='true',r=>r.memberships.push(r.memberships[0]),r=>r.memberships[0].partner.displayName='<script>']){const v=structuredClone(raw);change(v);assert.throws(()=>parseWorkspaces(v))}
const portfolio={partner:{id:a,displayName:'Partner A'},societies:[{id:b,name:'Society A',status:'ACTIVE'}],hasMore:false}
assert.equal(parsePortfolio(portfolio,a).societies.length,1)
assert.throws(()=>parsePortfolio(portfolio,c))
assert.throws(()=>parsePortfolio({...portfolio,societies:[...portfolio.societies,...portfolio.societies]},a))
assert.throws(()=>parsePortfolio({...portfolio,societies:[{id:b,name:'Society',status:'ARCHIVED'}]},a))
assert.equal(parsePartnerMembers([{id:b,role:'SUPPORT',createdAt:'2026-10-13T00:00:00.000Z'}]).length,1)
assert.throws(()=>parsePartnerMembers([{id:b,role:'SUPER_ADMIN',createdAt:'2026-10-13T00:00:00.000Z'}]))
assert.notEqual(partnerSessionKey({sessionId:a,societyId:b,role:'OWNER'}),partnerSessionKey({sessionId:c,societyId:b,role:'OWNER'}))
console.log('V5.4.8 partner scope, role projection and session identity: PASS')
