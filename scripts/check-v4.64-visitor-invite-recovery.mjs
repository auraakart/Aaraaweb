import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const must=(label,source,tokens)=>{const missing=tokens.filter(t=>!source.includes(t));if(missing.length){console.error(label+' missing: '+missing.join(', '));process.exit(1)}};

const root=JSON.parse(read('package.json'));
const api=JSON.parse(read('services/api/package.json'));
const admin=JSON.parse(read('apps/admin/package.json'));
if(root.version!=='4.64.0'||api.version!==root.version||admin.version!==root.version){console.error('Root/API/Admin release identity must be V4.64.0.');process.exit(1)}
for(const file of ['apps/resident/pubspec.yaml','apps/guard/pubspec.yaml']) must(file,read(file),['version: 4.64.0+46400']);

must('V4.64 server invite recovery',read('services/api/src/access/access.service.ts'),['visitorInviteFingerprint(','visitorInviteIdempotencyKey','visitorInviteFingerprint: fingerprint','pg_advisory_xact_lock','Idempotency key was already used for a different visitor invite','Visitor invite is no longer active','credentialHash: rotated.hash','replayed: true']);
must('V4.64 route idempotency',read('services/api/src/access/access.controller.ts'),["@Headers('idempotency-key') idempotencyKey",'Idempotency-Key header is required']);
must('V4.64 Resident retry identity',read('apps/resident/lib/data/resident_data_controller.dart'),['_GuestInviteAttempt? _pendingGuestInviteAttempt;','_guestInviteInFlightSignature',"idempotencyKey: 'resident-visitor-",'previous != null && previous.signature == signature','idempotencyKey: attempt.idempotencyKey']);
must('V4.64 Resident transport header',read('apps/resident/lib/data/resident_repository.dart'),['required String idempotencyKey',"{'Idempotency-Key': idempotencyKey}"]);
must('V4.64 API regression',read('services/api/src/access/access.service.spec.ts'),['reuses a same-key visitor invite with a rotated credential and rejects mismatched reuse','expect(create).toHaveBeenCalledTimes(1)','ConflictException']);
must('V4.64 Resident regression',read('apps/resident/test/gate_screen_test.dart'),['visitor invite retry reuses the same idempotency identity and validity window','expect(repository.keys[1], repository.keys[0])','expect(repository.from[1], repository.from[0])']);
must('V4.64 release truth',read('docs/AARAAGATE-V4.64-VISITOR-INVITE-RECOVERY.md'),['Release candidate closed on `develop`; release identity is V4.64.0.','does not create another request','does not claim staging/main promotion']);

console.log('V4.64 visitor invite recovery release closure: PASS');
