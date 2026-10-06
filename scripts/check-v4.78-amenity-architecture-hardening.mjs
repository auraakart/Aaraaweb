import fs from 'node:fs';
import { readContractBundle } from './lib/source-contract-bundles.mjs';

const service=readContractBundle('amenities');
const bookingCreator=fs.readFileSync('services/api/src/amenities/amenity-booking-creator.ts','utf8');
const amenityBookingSource=service+'\n'+bookingCreator;
const page=fs.readFileSync('apps/admin/app/amenities/page.tsx','utf8');
const policy=fs.readFileSync('apps/admin/app/amenities/amenity-policy.ts','utf8');
const fields=fs.readFileSync('apps/admin/app/amenities/no-show-policy-fields.tsx','utf8');
const tests=fs.readFileSync('services/api/src/amenities/amenities-no-show-policy.spec.ts','utf8');
const accessTests=fs.readFileSync('services/api/src/access/access.service.spec.ts','utf8');

const requiredService=[
  'CURRENT_TIMESTAMP AS "evaluatedAt"',
  '"restrictedUntil"',
  'restrictedUntil.getTime()>evaluatedAt.getTime()',
];
const missingService=requiredService.filter(token=>!amenityBookingSource.includes(token));
if(missingService.length){
  console.error(`V4.78 database-clock contract missing: ${missingService.join(', ')}`);
  process.exit(1);
}
const noShowSlice=bookingCreator.slice(bookingCreator.indexOf('private async noShowEligibility'),bookingCreator.indexOf('private async assertNoShowEligibility'));
if(noShowSlice.includes('Date.now()')){
  console.error('V4.78 no-show eligibility must not depend on the application clock.');
  process.exit(1);
}

const requiredAdmin=[
  "from './amenity-policy'",
  "from './no-show-policy-fields'",
  'parseNoShowPolicyDraft({restrictionCount:noShowRestrictionCount',
  'parseNoShowPolicyDraft({restrictionCount:nextNoShowCount',
  '<NoShowPolicyFields',
];
const missingAdmin=requiredAdmin.filter(token=>!page.includes(token));
if(missingAdmin.length){
  console.error(`V4.78 Admin policy extraction missing: ${missingAdmin.join(', ')}`);
  process.exit(1);
}
for(const duplicated of [
  'No-show threshold must be 10 or fewer',
  'No-show lookback must be 365 days or fewer',
  'No-show pause must be 365 days or fewer',
]){
  if(page.includes(duplicated)){
    console.error(`V4.78 page must not duplicate no-show validation: ${duplicated}`);
    process.exit(1);
  }
}

for(const token of [
  'parseNoShowPolicyDraft',
  'No-show threshold, lookback days and pause days must be configured together',
  "optionalBoundedInteger(draft.restrictionCount,'No-show threshold',1,10)",
  "optionalBoundedInteger(draft.lookbackDays,'No-show lookback days',1,365)",
  "optionalBoundedInteger(draft.blockDays,'No-show pause days',1,365)",
]){
  if(!policy.includes(token)){
    console.error(`V4.78 typed policy contract missing: ${token}`);
    process.exit(1);
  }
}
for(const label of ['No-show threshold','No-show lookback (days)','No-show booking pause (days)']){
  if(!fields.includes(label)){
    console.error(`V4.78 extracted field missing: ${label}`);
    process.exit(1);
  }
}
if(!tests.includes('blocks a new booking using the database evaluation time')){
  console.error('V4.78 database-clock regression test is missing.');
  process.exit(1);
}

const replayTestStart=accessTests.indexOf('reuses a same-key visitor invite with a rotated credential and rejects mismatched reuse');
const replayTestEnd=accessTests.indexOf("it('denies an access type disabled for the society tier'",replayTestStart);
const replayTest=replayTestStart>=0&&replayTestEnd>replayTestStart?accessTests.slice(replayTestStart,replayTestEnd):'';
if(!replayTest.includes('const now = Date.now()')||!replayTest.includes('new Date(now + 60 * 60_000)')){
  console.error('V4.78 full-regression hardening requires a time-relative active visitor invite replay fixture.');
  process.exit(1);
}
if(/new Date\(['"]2026-/.test(replayTest)){
  console.error('V4.78 visitor invite replay fixture must not use an aging fixed 2026 validity date.');
  process.exit(1);
}

console.log('V4.78 amenity architecture hardening contract is intact.');
