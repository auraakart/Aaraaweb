import assert from 'node:assert/strict'
import { parseLicensingOverview, parseDomainPreview, licensingSessionKey, licensingRequestKey } from '../lib/admin-licensing.ts'
const societyId='11111111-1111-4111-8111-111111111111',partnerId='22222222-2222-4222-8222-222222222222',grantId='33333333-3333-4333-8333-333333333333'
const session={sessionId:'44444444-4444-4444-8444-444444444444',societyId,role:'SUPER_ADMIN'}
const raw={society:{id:societyId,name:'Selected society',ownershipVersion:1,productTier:'STARTER',enabledFeatures:['VISITOR_MANAGEMENT','SOS']},partner:{id:partnerId,name:'Partner',status:'ACTIVE'},licenses:[{grantId,grantVersion:1,planCode:'SAFE_PLAN',planVersion:1,startsAt:'2026-01-01T00:00:00Z',endsAt:'2030-01-01T00:00:00Z',graceUntil:null,phase:'ACTIVE',approvalState:'APPROVED',maximumSocieties:5,maximumDomains:1,used:1,consent:null,allocation:null,snapshotMatches:false,capabilities:{canApprove:false,canOptIn:true,canWithdraw:false,canActivate:false,canRevoke:true}}],hasMore:false,domainPreviewEnabled:true}
const parsed=parseLicensingOverview(raw,societyId)
assert.equal(parsed.licenses[0].maximumSocieties,5)
for(const mutate of [r=>r.society.id=partnerId,r=>r.society.enabledFeatures.push('FAKE'),r=>r.licenses[0].capabilities.canActivate='true',r=>r.licenses[0].maximumSocieties=-1,r=>r.licenses[0].endsAt='2026-02-30T00:00:00Z',r=>r.licenses.push(r.licenses[0]),r=>r.partner.name='<script>',r=>r.licenses[0].approvalState='ENABLED']){
 const bad=structuredClone(raw);mutate(bad);assert.throws(()=>parseLicensingOverview(bad,societyId))
}
assert.notEqual(licensingSessionKey(session),licensingSessionKey({...session,societyId:partnerId}))
assert.notEqual(licensingRequestKey(session,parsed,parsed.licenses[0],'activate'),licensingRequestKey(session,{...parsed,society:{...parsed.society,ownershipVersion:2}},parsed.licenses[0],'activate'))
const candidate={hostname:'homes.partner.community',societyId,partnerId,testOnly:true,candidateOnly:true,routingActivated:false}
assert.equal(parseDomainPreview(candidate,parsed).hostname,candidate.hostname)
for(const change of [{societyId:partnerId},{partnerId:societyId},{routingActivated:true},{testOnly:false},{hostname:'javascript:alert(1)'}])assert.throws(()=>parseDomainPreview({...candidate,...change},parsed))
console.log('V5.4.6 licensing scope, runtime states, retry identity and cosmetic domain contract: PASS')
