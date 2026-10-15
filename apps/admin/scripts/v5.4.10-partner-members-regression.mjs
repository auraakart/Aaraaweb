import assert from 'node:assert/strict'
import { parsePendingInvitations, validPartnerUuid, isCurrentMemberOperator } from '../lib/admin-partner-member.ts'
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222'
const invite={id:a,partnerId:b,role:'COMMERCIAL_ADMIN',expiresAt:'2026-10-21T00:00:00.000Z',partner:{displayName:'Partner A'}}
assert.equal(validPartnerUuid(a),true);assert.equal(validPartnerUuid('evil'),false)
assert.equal(isCurrentMemberOperator(['COMMERCIAL_ADMIN']),false)
assert.equal(isCurrentMemberOperator(['OWNER','BRAND_MANAGER']),true)
assert.equal(parsePendingInvitations([invite])[0].partnerName,'Partner A')
for(const change of [v=>v.id='invalid',v=>v.partnerId='other',v=>v.role='SUPER_ADMIN',v=>v.expiresAt='yesterday',v=>v.partner.displayName='<script>']){
 const v=structuredClone(invite);change(v);assert.throws(()=>parsePendingInvitations([v]))
}
assert.throws(()=>parsePendingInvitations([invite,invite]))
assert.throws(()=>parsePendingInvitations(Array.from({length:51},()=>invite)))
console.log('V5.4.10 commercial invitation parser and role gating: PASS')
