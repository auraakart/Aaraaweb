import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const requireTokens=(label,source,tokens)=>{for(const token of tokens){if(!source.includes(token))throw new Error(`${label} missing: ${token}`)}};

requireTokens('Root release',read('package.json'),['"version": "4.86.1"','check:v4.86']);
requireTokens('API release',read('services/api/package.json'),['"version": "4.86.1"']);
requireTokens('Admin release',read('apps/admin/package.json'),['"version": "4.86.1"']);
requireTokens('Resident release',read('apps/resident/pubspec.yaml'),['version: 4.86.1+48601']);
requireTokens('Guard release',read('apps/guard/pubspec.yaml'),['version: 4.86.1+48601']);

requireTokens('Easy mode preferences',read('apps/resident/lib/preferences/resident_experience_preferences.dart'),[
  'resident.preference.easy_mode','Device-local accessibility preference','never changes permissions',
]);
requireTokens('Easy mode shell',read('apps/resident/lib/main.dart'),[
  'ResidentExperiencePreferences','TextScaler.linear(easyMode ? 1.12 : 1.0)','height: widget.easyMode ? 76 : null',
]);
requireTokens('Easy mode profile',read('apps/resident/lib/screens/profile_screen.dart'),[
  "title: const Text('Easy mode'","All features remain available",
]);

requireTokens('Tally export service',read('services/api/src/accounting/accounting-export.service.ts'),[
  "'TALLY_CSV'","aaraagate-tally-journal","Voucher Type Name","paiseToRupees",
]);
requireTokens('Tally migration',read('services/api/prisma/migrations/20261007190000_v486_tally_export_format/migration.sql'),[
  "'CSV', 'JSONL', 'TALLY_CSV'",
]);
requireTokens('Tally UI',read('apps/admin/app/finance/exports/page.tsx'),[
  'Tally-friendly CSV','does not post or rewrite accounting records automatically',
]);

requireTokens('Activation readiness',read('services/api/src/migration/onboarding-readiness.service.ts'),[
  'eligibleResidents','activatedResidents','RESIDENT_ACTIVATION_NOT_STARTED','normal mobile OTP/session flows',
]);
requireTokens('Gate fallback KPI',read('services/api/src/reports/reports-analytics.service.ts'),[
  'GateNotificationAttempt','pushQueued','ivrSimulated','manualRequired','delivery evidence only',
]);
requireTokens('Trust transparency',read('apps/resident/lib/screens/privacy_data_screen.dart'),[
  'Commercial placement & provider trust','paid placement does not grant a provider access to household-private records',
  'not presented as an external security or privacy certification',
]);
const assistant=read('apps/resident/lib/screens/ai_assistant_screen.dart');
requireTokens('V4.86.1 Assistant premium UX',assistant,[
  "title: 'How can I help?'",
  "title: 'Quick actions'",
  "label: const Text('Create complaint')",
  "'Based on ' + sources.join(' · ')",
  'ResidentVoiceCopy.languageLabels.entries',
]);
for(const stale of ['Ask by voice','Prepare complaint','_factsView(']){
  if(assistant.includes(stale)) throw new Error(`V4.86.1 Assistant regression: stale UI token remains: ${stale}`);
}

const speech=read('apps/resident/lib/voice/resident_speech.dart');
requireTokens('V4.86.1 speech reliability',speech,[
  'bool _initialized = false',
  'Future<bool> _ensureInitialized()',
  'bestLocaleId',
  'partialResults: true',
  'cancelOnError: false',
  "assistantAction': 'Speak'",
  "'hi': 'हिंदी'",
]);

requireTokens('V4.86.1 milestone evidence',read('docs/AARAAGATE-V4.86.1-ASSISTANT-UX-VOICE-HARDENING.md'),[
  'Premium Assistant UX',
  'Speech reliability',
  'No autonomous mutation',
]);

requireTokens('V4.86 boundary',read('docs/AARAAGATE-V4.86-ADOPTION-COMPETITIVE-READINESS.md'),[
  'Hosting/provider deployment work is explicitly **on hold**','change owner/current-occupant gate or payment authority',
]);

console.log('V4.86 adoption and competitive readiness contract validated.');
