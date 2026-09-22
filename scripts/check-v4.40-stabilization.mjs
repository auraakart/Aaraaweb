import { readFileSync } from 'node:fs';

const admin = readFileSync('apps/admin/app/admin-console.tsx', 'utf8');
const adminTypes = readFileSync('apps/admin/lib/admin-domain-types.ts', 'utf8');
const guardApi = readFileSync('apps/guard/lib/data/guard_api.dart', 'utf8');
const guardScreen = readFileSync('apps/guard/lib/screens/guard_parcels_screen.dart', 'utf8');
const guardModels = readFileSync('apps/guard/lib/data/models/guard_boundary_models.dart', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

const fail = (message) => { throw new Error(message); };

if (!admin.includes("from '../lib/admin-domain-types'")) fail('Admin console must import extracted domain types');
if (/^type (Ticket|Activity|Notice|Building|Unit|Person|Occupancy|Ownership|Invoice|PaymentAudit|WorkforceAssignment|Gate|ServiceCategory|SosIncident)=/m.test(admin)) {
  fail('Admin console must not reintroduce local domain types');
}
if (!adminTypes.includes('export type Ticket=') || !adminTypes.includes('export type ServiceBooking=')) {
  fail('Extracted Admin domain type contract is incomplete');
}
if (!guardApi.includes('Future<List<GuardParcel>> parcelDesk()') || !guardApi.includes('Future<List<GuardParcelRecipient>> parcelRecipients()')) {
  fail('Guard parcel API must expose typed boundaries');
}
if (!guardScreen.includes('List<GuardParcel> _parcels') || !guardScreen.includes('List<GuardParcelRecipient> _recipients')) {
  fail('Guard parcel screen must consume typed boundaries');
}
if (!guardModels.includes('class GuardParcelRecipient')) fail('Guard parcel recipient model is required');
if (pkg.engines?.node !== '>=22 <23' || pkg.engines?.pnpm !== '>=10 <11') fail('Node/pnpm runtime baseline must stay explicit');

console.log('V4.40 stabilization contracts passed');
