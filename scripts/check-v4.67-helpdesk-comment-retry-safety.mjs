import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const must=(label,source,tokens)=>{const missing=tokens.filter(t=>!source.includes(t));if(missing.length){console.error(label+' missing: '+missing.join(', '));process.exit(1)}};

must('V4.67 Helpdesk activity schema',read('services/api/prisma/schema.prisma'),[
  'idempotencyKey String?',
  '@@unique([societyId, actorUserId, idempotencyKey], map: "HelpdeskActivity_society_actor_idempotency_key")'
]);
must('V4.67 migration',read('services/api/prisma/migrations/20260928005000_v467_helpdesk_comment_idempotency/migration.sql'),[
  'ADD COLUMN "idempotencyKey" TEXT',
  'CREATE UNIQUE INDEX "HelpdeskActivity_society_actor_idempotency_key"'
]);
must('V4.67 comment DTO',read('services/api/src/helpdesk/helpdesk.controller.ts'),[
  '@IsOptional() @IsString() @MinLength(8) @MaxLength(120) idempotencyKey?: string;',
  'dto.message, false, dto.idempotencyKey'
]);
must('V4.67 comment service',read('services/api/src/helpdesk/helpdesk.service.ts'),[
  'helpdesk-comment:${societyId}:${userId}:${normalizedKey}',
  'pg_advisory_xact_lock',
  '"idempotencyKey"=${normalizedKey}',
  'Idempotency key already used for a different helpdesk comment',
  '"message", "idempotencyKey"',
  'if (reviewer) {'
]);
must('V4.67 service regression',read('services/api/src/helpdesk/helpdesk.service.spec.ts'),[
  'exact resident comment same-key replay without a second activity',
  'same-key replay when ticket or normalized message changes',
  'keeps reviewer comments backward-compatible without resident idempotency keys'
]);
must('V4.67 Resident transport',read('apps/resident/lib/data/resident_repository.dart'),[
  'addHelpdeskComment(String ticketId, String message, {required String idempotencyKey})',
  "'idempotencyKey': idempotencyKey"
]);
must('V4.67 Resident retry identity',read('apps/resident/lib/screens/helpdesk_screen.dart'),[
  'String? commentSubmissionKey;',
  'commentSubmissionShape != message',
  'idempotencyKey: commentSubmissionKey!',
  'Retry will reuse this comment submission unless you edit the message.'
]);
must('V4.67 Resident retry regression',read('apps/resident/test/helpdesk_service_recovery_test.dart'),[
  'resident comment retry reuses request identity after ambiguous transport failure',
  'expect(repository.commentKeys[1],repository.commentKeys[0])'
]);
const root=JSON.parse(read('package.json'));
const api=JSON.parse(read('services/api/package.json'));
const admin=JSON.parse(read('apps/admin/package.json'));
const [major,minor]=root.version.split('.').map(Number);
if(major!==4||minor<67||api.version!==root.version||admin.version!==root.version){
  console.error('Root/API/Admin release identity must remain aligned at V4.67.0 or later on the V4 release line.');
  process.exit(1);
}
for(const pubspec of ['apps/resident/pubspec.yaml','apps/guard/pubspec.yaml']){
  must(pubspec,read(pubspec),['version: '+root.version+'+']);
}
must('V4.67 release truth',read('docs/AARAAGATE-V4.67-HELPDESK-COMMENT-RETRY-SAFETY.md'),[
  'release identity is 4.67.0',
  'Reviewer comments remain backward-compatible',
  'does not widen Helpdesk permissions'
]);
must('V4.67 closure',read('docs/AARAAGATE-V4.67-RELEASE-CLOSURE.md'),[
  'root/API/Admin: `4.67.0`',
  'Resident/Guard: `4.67.0+46700`',
  'Repository release truth is closed on `develop` only.'
]);
console.log('V4.67 Helpdesk comment retry-safety release contract: PASS');
