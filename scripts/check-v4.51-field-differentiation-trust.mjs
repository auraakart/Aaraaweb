import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const requireTokens=(label,source,tokens)=>{
  const missing=tokens.filter(token=>!source.includes(token));
  if(missing.length){console.error(`${label} missing: ${missing.join(', ')}`);process.exit(1)}
};

const residentSpeech=read('apps/resident/lib/voice/resident_speech.dart');
requireTokens('Resident vernacular voice draft',residentSpeech,[
  'abstract class ResidentSpeech',
  "'hi': 'hi_IN'",
  "'ta': 'ta_IN'",
  "'te': 'te_IN'",
  "'kn': 'kn_IN'",
  "'ml': 'ml_IN'",
  "'mr': 'mr_IN'",
  "'bn': 'bn_IN'",
  'Voice captured. Review the draft before submitting.',
]);
const helpdesk=read('apps/resident/lib/screens/helpdesk_screen.dart');
requireTokens('Helpdesk voice review boundary',helpdesk,[
  'DeviceResidentSpeech',
  "ResidentVoiceCopy.text(languageCode, 'action')",
  'description.text = clean',
  'Submit complaint',
]);
if(helpdesk.includes('speech.listenOnce')&&!helpdesk.includes('Submit complaint')){
  console.error('V4.51 regression: voice input must remain a reviewable draft before submit');
  process.exit(1);
}

const fallback=read('services/api/src/notifications/gate-notification-fallback.service.ts');
requireTokens('Gate fallback evidence',fallback,[
  "channel:'IVR'",
  "status:'SIMULATED'",
  "channel:'MANUAL'",
  "status:'REQUIRED'",
  'phoneSuffix:phone.slice(-4)',
  '"GateNotificationAttempt"',
]);
const realtime=read('services/api/src/notifications/notification-realtime.service.ts');
requireTokens('Gate push-fallback orchestration',realtime,[
  'residentDeliveryReadiness',
  'recordPushQueued',
  "'PUSH_DELIVERY_FAILED'",
  "'NO_ACTIVE_PUSH_DEVICE'",
  "'PUSH_TRANSPORT_UNAVAILABLE'",
]);
const migration=read('services/api/prisma/migrations/20260923200000_v451_gate_notification_fallback/migration.sql');
requireTokens('Gate fallback migration',migration,[
  'CREATE TABLE "GateNotificationAttempt"',
  '"channel" TEXT NOT NULL',
  '"evidence" JSONB NOT NULL',
  'GateNotificationAttempt_scope_request_user_channel_key',
]);

const billing=read('services/api/src/billing/billing.service.ts');
requireTokens('Resident finance clarity',billing,[
  'async residentSummary',
  "mode:'FULL_INVOICE'",
  'residentPartialPayment:false',
  'advanceBalanceVisibility:false',
  'payerPrivateEvidence:true',
]);
const billingUi=read('apps/resident/lib/screens/billing_screen.dart');
requireTokens('Resident finance UX',billingUi,[
  'maintenanceSummary',
  "'Overdue \${_money(overduePaise)}'",
  "payment follow-up",
  "policy['explanation']",
]);

const access=read('services/api/src/access-integration/access-integration.service.ts');
requireTokens('Access simulator certification',access,[
  'async simulatorCertification',
  "'aaraagate.access-simulator.v1'",
  'idempotentReplayStable',
  'failsClosed',
  'not physical-device or vendor certification',
]);
const accessController=read('services/api/src/access-integration/access-integration.controller.ts');
requireTokens('Access simulator route',accessController,[
  "@Post('simulator-certification')",
  'simulatorCertification',
  'AppPermission.GATE_MANAGE',
]);

const community=read('apps/resident/lib/screens/community_screen.dart');
requireTokens('Privacy-first Community',community,[
  'Community, not a promotion feed',
  'Commercial discovery stays under Services',
  'active relationship and access rules',
]);

const assistant=read('services/api/src/ai-operations/ai-assistant.service.ts');
requireTokens('Operational Intelligence 2.0',assistant,[
  'residentIntentRoutingText',
  'likelyCause?:string',
  'safeWorkflow?:string[]',
  'likelyCause:focus.likelyCause',
  'safeWorkflow:focus.safeWorkflow',
]);
const adminAssistant=read('apps/admin/app/ai-assistant/page.tsx');
requireTokens('Admin AI 2.0 explanation',adminAssistant,[
  '<b>Likely cause:</b>',
  '<b>Safe workflow:</b>',
]);

const integration=read('services/api/src/integrations/integration-registry.service.ts');
requireTokens('Telephony integration truth boundary',integration,[
  "'TELEPHONY_IVR'",
  "'SIMULATOR_CONTRACT'",
  'No live telephony provider is claimed',
]);

const milestone=read('docs/AARAAGATE-V4.51-FIELD-DIFFERENTIATION-TRUST.md');
requireTokens('V4.51 milestone evidence',milestone,[
  'Resident voice + vernacular actions',
  'Gate communication fallback',
  'Resident finance clarity',
  'Access hardware certification simulator',
  'Privacy-first Community',
  'Operational Intelligence 2.0',
]);

console.log('V4.51 field-differentiation and trust contracts are intact.');
