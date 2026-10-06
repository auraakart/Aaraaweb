import fs from 'node:fs';
import { readContractBundle } from './lib/source-contract-bundles.mjs';
function read(path){return fs.readFileSync(path,'utf8')}
function requireTokens(label,content,tokens){const missing=tokens.filter(token=>!content.includes(token));if(missing.length)throw new Error(`${label} missing: ${missing.join(', ')}`)}
const migration=read('services/api/prisma/migrations/20260929100000_v4792_amenity_deposit_lifecycle/migration.sql');
const amenities=readContractBundle('amenities');
const billing=readContractBundle('billing');
const webhookReplay=read('services/api/src/billing/billing-webhook-replay.spec.ts');
const availability=read('services/api/src/accounting/payment-availability.service.ts');
const resident=read('apps/resident/lib/screens/amenities_screen.dart');
const admin=read('apps/admin/app/amenities/page.tsx');
requireTokens('Deposit persistence',migration,['depositPaise','depositStatus','depositPaymentWindowMinutes','AMENITY_DEPOSIT','Payment_source_check','ReceivableAllocation_payment_purpose_guard']);
requireTokens('Amenity lifecycle',amenities,['APPROVAL_PENDING','PAYMENT_REQUIRED','REFUND_REQUIRED','Refundable deposit must be captured before amenity check-in','expireUnpaidDeposits','promoteNextWaitlist']);
requireTokens('Payment truth',billing,['createAmenityDepositPayment',"'AMENITY_DEPOSIT'",'purposeType','depositStatus','REFUNDED']);
requireTokens('Purpose-aware webhook replay contract',webhookReplay,["purposeType: 'MAINTENANCE_INVOICE'","purposeType: 'AMENITY_DEPOSIT'",'UPDATE "MaintenanceInvoice"','UPDATE "AmenityBooking"','processingStatus']);
requireTokens('Maintenance cash separation',availability,['"purposeType"=\'MAINTENANCE_INVOICE\'']);
requireTokens('Resident deposit UX',resident,['Pay deposit','Refundable deposit','gateway confirmation','createAmenityDepositPayment']);
requireTokens('Admin deposit policy',admin,['Refundable deposit (₹)','Deposit payment window (minutes)','refundableDepositPaise','depositStatus']);
if(billing.includes('depositStatus"=\'CAPTURED\'')&&!billing.includes("event.status==='CAPTURED'"))throw new Error('Deposit capture must remain provider-webhook driven.');
if(webhookReplay.includes('expect(tx.$executeRaw).toHaveBeenCalledTimes('))throw new Error('Webhook replay tests must assert financial side effects, not a brittle SQL call count.');
console.log('V4.79.2 amenity deposit lifecycle contract OK');
