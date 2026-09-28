import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const must=(label,source,tokens)=>{const missing=tokens.filter(t=>!source.includes(t));if(missing.length){console.error(label+' missing: '+missing.join(', '));process.exit(1)}};

must('V4.68 emergency-contact schema',read('services/api/prisma/schema.prisma'),[
  'idempotencyKey String?',
  '@@unique([societyId, householdId, idempotencyKey], map: "EmergencyContact_society_household_idempotency_key")'
]);
must('V4.68 migration',read('services/api/prisma/migrations/20260928012000_v468_emergency_contact_recovery/migration.sql'),[
  'ADD COLUMN "idempotencyKey" TEXT',
  'CREATE UNIQUE INDEX "EmergencyContact_society_household_idempotency_key"'
]);
must('V4.68 controller DTO',read('services/api/src/households/households.controller.ts'),[
  '@IsString() @MinLength(8) @MaxLength(120) idempotencyKey!: string;'
]);
must('V4.68 service recovery',read('services/api/src/households/household.service.ts'),[
  'emergency-contact:${societyId}:${householdId}:${idempotencyKey}',
  'pg_advisory_xact_lock',
  "existing.name.trim().toLowerCase() === name.toLowerCase()",
  "existing.phone.replace(/\\D/g, '') === phone.replace(/\\D/g, '')",
  'Idempotency key already used for a different emergency contact',
  'if (!contact.active) return contact;'
]);
must('V4.68 risk coverage',read('services/api/vitest.risk-coverage.config.ts'),[
  'src/households/household.service.spec.ts',
  "'src/households/household.service.ts':",
  'statements: 12',
  'lines: 12'
]);
must('V4.68 API regression',read('services/api/src/households/household.service.spec.ts'),[
  'exact emergency-contact same-key replay without a second insert',
  'same-key replay when normalized intent changes',
  'persists the emergency-contact request identity',
  'deactivation replay as success'
]);
must('V4.68 Resident transport',read('apps/resident/lib/data/emergency_contact_actions.dart'),[
  'required String idempotencyKey',
  "'idempotencyKey': idempotencyKey"
]);
must('V4.68 Resident recovery',read('apps/resident/lib/data/resident_data_controller.dart'),[
  '_emergencyContactAttemptKeys',
  'emergencyContactsForHousehold',
  'excludingIds: existingIds',
  'resident-emergency-contact-',
  'deactivateEmergencyContact'
]);
must('V4.68 Resident screen boundary',read('apps/resident/lib/screens/emergency_contacts_screen.dart'),[
  'widget.controller.addEmergencyContact',
  'widget.controller.deactivateEmergencyContact',
  'It is safe to retry.'
]);
must('V4.68 Resident regression',read('apps/resident/test/emergency_contact_recovery_test.dart'),[
  'reuses request identity when response and first recovery read are lost',
  'expect(api.addKeys[1], api.addKeys[0])',
  'accepts authoritative absence after a lost response'
]);
must('V4.68 development truth',read('docs/AARAAGATE-V4.68-EMERGENCY-CONTACT-RECOVERY.md'),[
  'release identity remains 4.67.0',
  'Emergency contacts remain household information only.',
  'does not create resident membership'
]);
console.log('V4.68 emergency-contact mutation recovery development contract: PASS');
