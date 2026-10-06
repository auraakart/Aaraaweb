import fs from 'node:fs';
import { readContractBundle } from './lib/source-contract-bundles.mjs';

const read=path=>fs.readFileSync(path,'utf8');
const requireTokens=(label,source,tokens)=>{
  const missing=tokens.filter(token=>!source.includes(token));
  if(missing.length){console.error(`${label} missing: ${missing.join(', ')}`);process.exit(1);}
};
const forbidTokens=(label,source,tokens)=>{
  const present=tokens.filter(token=>source.includes(token));
  if(present.length){console.error(`${label} prohibited: ${present.join(', ')}`);process.exit(1);}
};

const service=readContractBundle('amenities');
const bookingCreator=read('services/api/src/amenities/amenity-booking-creator.ts');
requireTokens('Amenity no-show policy',service+'\n'+bookingCreator,[
  'noShowRestrictionCount',
  'noShowLookbackDays',
  'noShowBlockDays',
  'assertNoShowEligibility',
  'noShowEligibility',
  'New bookings for this amenity are paused until',
]);
requireTokens('Waitlist promotion fairness',service,[
  'ns."status"=\'NO_SHOW\'',
  'COUNT(*)>=',
  'MAX(ns."noShowAt")',
  'FOR UPDATE SKIP LOCKED',
]);
requireTokens('No-show race serialization',service,[
  'pg_advisory_xact_lock',
  'identity[0].amenityId',
]);

const migration=read('services/api/prisma/migrations/20260928223000_v477_amenity_no_show_fair_use/migration.sql');
requireTokens('Database no-show defense',migration,[
  'enforce_amenity_no_show_fair_use',
  'AmenityBooking_no_show_fair_use_guard',
  'AmenityWaitlist_no_show_fair_use_guard',
  "b.\"status\"='NO_SHOW'",
]);

const admin=read('apps/admin/app/amenities/page.tsx');
const adminPolicy=read('apps/admin/app/amenities/amenity-policy.ts');
const adminFields=read('apps/admin/app/amenities/no-show-policy-fields.tsx');
requireTokens('Admin no-show policy wiring',admin,[
  'parseNoShowPolicyDraft',
  'NoShowPolicyFields',
]);
requireTokens('Admin no-show policy fields',adminFields,[
  'No-show threshold',
  'No-show lookback (days)',
  'No-show booking pause (days)',
]);
requireTokens('Admin no-show policy validation',adminPolicy,[
  'No-show threshold, lookback days and pause days must be configured together',
  "optionalBoundedInteger(draft.restrictionCount,'No-show threshold',1,10)",
  "optionalBoundedInteger(draft.lookbackDays,'No-show lookback days',1,365)",
  "optionalBoundedInteger(draft.blockDays,'No-show pause days',1,365)",
]);

const resident=read('apps/resident/lib/screens/amenities_screen.dart');
requireTokens('Resident no-show disclosure',resident,[
  '_amenityNoShowPolicyLabel',
  'Fair-use no-show rule',
  'This never posts a fee or cancels an existing booking',
]);

const trace=read('docs/REQUIREMENTS-TRACEABILITY.md');
requireTokens('Traceability no-show boundary',trace,[
  'optional bounded non-financial no-show fair-use rule',
  'Financial no-show charges/deposits',
]);

const program=read('docs/AARAAGATE-V4.77-AMENITY-NO-SHOW-FAIR-USE.md');
requireTokens('V4.77 evidence',program,[
  'Disabled by default',
  'Resident-specific, not household-wide',
  'Direct booking, waitlist and promotion parity',
  'No financial penalty',
  'Productionization remains explicitly excluded',
]);
forbidTokens('V4.77 evidence',program,[
  'automatic fee posting enabled',
  'existing bookings are cancelled',
  'production readiness increased',
]);

console.log('V4.77 amenity no-show fair-use contracts are intact.');
