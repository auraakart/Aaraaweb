import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const must=(label,source,tokens)=>{const missing=tokens.filter(t=>!source.includes(t));if(missing.length){console.error(label+' missing: '+missing.join(', '));process.exit(1)}};

const root=JSON.parse(read('package.json'));
const api=JSON.parse(read('services/api/package.json'));
const admin=JSON.parse(read('apps/admin/package.json'));
const currentVersion=root.version.split('.').map(Number);
const atLeastV463=currentVersion.length===3&&currentVersion.every(Number.isInteger)&&(currentVersion[0]>4||(currentVersion[0]===4&&currentVersion[1]>=63));
if(!atLeastV463||api.version!==root.version||admin.version!==root.version){console.error('Root/API/Admin release identity must remain aligned at V4.63.0 or newer.');process.exit(1)}
const runtimeVersionToken='version: '+root.version+'+';
for(const file of ['apps/resident/pubspec.yaml','apps/guard/pubspec.yaml']) if(!read(file).includes(runtimeVersionToken)){console.error('Resident/Guard release identity must remain aligned with the current root release.');process.exit(1)}

must('V4.63 SOS server recovery',read('services/api/src/sos/sos.service.ts'),['pg_advisory_xact_lock','const activeScopeKey = `sos:${societyId}:${input.unitId}:${residentUserId}`;',"\"status\" IN ('ACTIVE', 'ACKNOWLEDGED')",'if (existing[0]) return existing[0];']);
must('V4.63 Resident SOS status parity',read('apps/resident/lib/data/models/resident_sos_incident.dart'),["status == 'ACTIVE' || status == 'TRIGGERED' || status == 'ACKNOWLEDGED'"]);
must('V4.63 Resident SOS recovery',read('apps/resident/lib/screens/sos_screen.dart'),['SOS is active. Security has been notified.','SOS state refreshed. This incident is no longer active.','_incidentById(incident.id)']);
must('V4.63 API regression',read('services/api/src/sos/sos.service.spec.ts'),['serializes the resident/unit trigger scope and reuses an existing active incident','pg_advisory_xact_lock','sos:society-1:unit-1:user-1']);
must('V4.63 Resident regression',read('apps/resident/test/sos_screen_test.dart'),['uncertain SOS trigger recovers authoritative active incident without a second submission','uncertain SOS cancellation reloads authoritative inactive state','expect(api.postCalls,1)']);
must('V4.63 release truth',read('docs/AARAAGATE-V4.63-SOS-RECOVERY.md'),['Release candidate closed on `develop`; release identity is V4.63.0.','does not automatically submit a second SOS','does not claim staging/main promotion']);

console.log('V4.63 SOS state convergence and recovery release closure: PASS');
