import fs from 'node:fs';
import { readContractBundle } from './lib/source-contract-bundles.mjs';

const read=(path)=>fs.readFileSync(path,'utf8');
const requireTokens=(label,source,tokens)=>{
  const missing=tokens.filter(token=>!source.includes(token));
  if(missing.length){
    console.error(`${label} missing semantic contract tokens: ${missing.join(', ')}`);
    process.exit(1);
  }
};
const forbidTokens=(label,source,tokens)=>{
  const present=tokens.filter(token=>source.includes(token));
  if(present.length){
    console.error(`${label} contains prohibited V4.73 boundary tokens: ${present.join(', ')}`);
    process.exit(1);
  }
};

const service=readContractBundle('amenities');
const bookingCreator=read('services/api/src/amenities/amenity-booking-creator.ts');
const policyEngine=read('services/api/src/amenities/amenity-policy.engine.ts');
const amenityDomain=`${service}\n${bookingCreator}\n${policyEngine}`;
requireTokens('Amenity guest policy',amenityDomain,[
  'maxGuestsPerBooking',
  'validateGuestCount',
  'guestCount',
  'Guests are not enabled for this amenity',
  'Guest limit cannot be reduced below',
]);
requireTokens('Waitlist guest continuity',service,[
  'w."guestCount"',
  'waiter.guestCount',
  'rules.maxGuestsPerBooking ?? 0',
]);

const controller=read('services/api/src/amenities/amenities.controller.ts');
requireTokens('Amenity guest input validation',controller,[
  '@IsOptional() @IsInt() @Min(0) @Max(50) guestCount?: number;',
]);

const migration=read('services/api/prisma/migrations/20260928190000_v473_amenity_guest_count/migration.sql');
requireTokens('Amenity guest database bounds',migration,[
  'AmenityBooking_guestCount_check',
  'AmenityWaitlistEntry_guestCount_check',
  'CHECK ("guestCount" BETWEEN 0 AND 50)',
]);

const resident=read('apps/resident/lib/screens/amenities_screen.dart');
requireTokens('Resident guest UX',resident,[
  'Only the number of guests is stored; guest names are not collected.',
  'selection.guestCount',
  'guestCount: selection.guestCount',
  'Up to $maxGuests guests',
  "entry['guestCount']",
  "booking['guestCount']",
]);

const actions=read('apps/resident/lib/data/amenity_actions.dart');
requireTokens('Resident guest payload continuity',actions,[
  'int guestCount = 0',
  "'guestCount': guestCount",
]);

const admin=read('apps/admin/app/amenities/page.tsx');
requireTokens('Admin guest policy control',admin,[
  'maxGuestsPerBooking',
  'Max guests / booking',
  'Maximum guests per booking (0 = residents only)',
  'Maximum guests must be 50 or fewer',
]);

const program=read('docs/AARAAGATE-V4.73-AMENITY-PARTICIPATION-POLICY.md');
requireTokens('V4.73 program evidence',program,[
  'Guest/Companion Count Policy',
  'Privacy-minimal participation',
  'Waitlist continuity',
  'Refundable deposits are explicitly deferred',
  'Productionization remains explicitly excluded',
]);
forbidTokens('V4.73 program evidence',program,[
  'guest identity collection enabled',
  'refundable deposit live',
  'production readiness increased',
  'automatic refund enabled',
]);

console.log('V4.73 amenity participation policy contracts are intact.');
