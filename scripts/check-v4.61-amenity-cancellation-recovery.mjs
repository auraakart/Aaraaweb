import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const must=(label,source,tokens)=>{const missing=tokens.filter(t=>!source.includes(t));if(missing.length){console.error(label+' missing: '+missing.join(', '));process.exit(1)}};

const screen=read('apps/resident/lib/screens/amenities_screen.dart');
must('V4.61 amenity cancellation recovery',screen,[
  '_recoverCancellationFailure(booking, error)',
  'await _load();',
  "return 'Booking changed. Latest status: $status.';",
  "return 'Booking changed and is no longer in your current booking list.';",
  "message.toLowerCase().contains('slot is no longer available')",
  "if (message.isNotEmpty) return message.endsWith('.') ? message : '$message.';"
]);

must('V4.61 amenity cancellation regressions',read('apps/resident/test/amenities_screen_test.dart'),[
  'failed amenity cancellation reloads authoritative booking state before messaging',
  'Booking changed. Latest status: Cancelled.',
  'amenity cancellation cutoff preserves the server conflict reason',
  'Booking cannot be cancelled within 60 minutes of start time.'
]);

const rootPackage=JSON.parse(read('package.json'));
const apiPackage=JSON.parse(read('services/api/package.json'));
const adminPackage=JSON.parse(read('apps/admin/package.json'));
const currentVersion=rootPackage.version.split('.').map(Number);
const atLeastV461=currentVersion.length===3&&currentVersion.every(Number.isInteger)&&(currentVersion[0]>4||(currentVersion[0]===4&&currentVersion[1]>=61));
if(!atLeastV461||apiPackage.version!==rootPackage.version||adminPackage.version!==rootPackage.version){
  console.error('Root/API/Admin release identity must remain aligned at V4.61.0 or newer.');
  process.exit(1);
}
const runtimeVersionToken='version: '+rootPackage.version+'+';
if(!read('apps/resident/pubspec.yaml').includes(runtimeVersionToken)||!read('apps/guard/pubspec.yaml').includes(runtimeVersionToken)){
  console.error('Resident/Guard release identity must remain aligned with the current root release.');
  process.exit(1);
}

must('V4.61 release truth',read('docs/AARAAGATE-V4.61-AMENITY-CANCELLATION-RECOVERY.md'),[
  'Release candidate closed on `develop`; release identity is V4.61.0.',
  'server rejection remains authoritative',
  'V4.61 release closure is repository evidence on `develop`'
]);
must('V4.61 release closure evidence',read('docs/AARAAGATE-V4.61-RELEASE-CLOSURE.md'),[
  'PR #928',
  '4.61.0+46100',
  'does not claim staging/main promotion'
]);

console.log('V4.61 amenity cancellation recovery release closure: PASS');
