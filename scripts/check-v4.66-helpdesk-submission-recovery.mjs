import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const must=(label,source,tokens)=>{const missing=tokens.filter(t=>!source.includes(t));if(missing.length){console.error(label+' missing: '+missing.join(', '));process.exit(1)}};

must('V4.66 Helpdesk schema',read('services/api/prisma/schema.prisma'),[
  'idempotencyKey String?',
  '@@unique([societyId, createdById, idempotencyKey], map: "HelpdeskTicket_society_creator_idempotency_key")'
]);
must('V4.66 migration',read('services/api/prisma/migrations/20260928002000_v466_helpdesk_create_idempotency/migration.sql'),[
  'ADD COLUMN "idempotencyKey" TEXT',
  'CREATE UNIQUE INDEX "HelpdeskTicket_society_creator_idempotency_key"'
]);
must('V4.66 Helpdesk DTO',read('services/api/src/helpdesk/helpdesk.controller.ts'),[
  '@IsString() @MinLength(8) @MaxLength(120) idempotencyKey!: string;'
]);
must('V4.66 Helpdesk service',read('services/api/src/helpdesk/helpdesk.service.ts'),[
  'pg_advisory_xact_lock',
  '"idempotencyKey"=${idempotencyKey}',
  'Idempotency key already used for a different complaint',
  '"societyId", "unitId", "createdById", "idempotencyKey"',
  'return existing;'
]);
must('V4.66 AI confirmed complaint identity',read('services/api/src/ai-operations/ai-operations.service.ts'),[
  'idempotencyKey:`ai-helpdesk:${proposalId}`'
]);
must('V4.66 AI idempotency regression',read('services/api/src/ai-operations/ai-operations.service.spec.ts'),[
  "idempotencyKey:'ai-helpdesk:proposal-1'"
]);
must('V4.66 Resident repository',read('apps/resident/lib/data/resident_repository.dart'),[
  'required String idempotencyKey',
  "'idempotencyKey': idempotencyKey"
]);
must('V4.66 Resident retry identity',read('apps/resident/lib/screens/helpdesk_screen.dart'),[
  'String? submissionKey;',
  'String? submissionShape;',
  'submissionShape != shape',
  'idempotencyKey: submissionKey!',
  'Retry will reuse this submission unless you edit the complaint.'
]);
must('V4.66 idempotency regression',read('services/api/src/helpdesk/helpdesk.service.spec.ts'),[
  'returns the original complaint for an exact same-key replay without a second create event',
  'rejects a same-key replay when normalized complaint intent changes',
  'expect(tx.$executeRaw).not.toHaveBeenCalled()'
]);
must('V4.66 development truth',read('docs/AARAAGATE-V4.66-HELPDESK-SUBMISSION-RECOVERY.md'),[
  'release identity remains 4.65.0',
  'Same-key requests are serialized inside the transaction.',
  'does not widen Helpdesk permissions'
]);
console.log('V4.66 Helpdesk submission recovery contract: PASS');
