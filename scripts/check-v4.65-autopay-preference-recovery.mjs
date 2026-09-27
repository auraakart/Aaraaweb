import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const must=(label,source,tokens)=>{const missing=tokens.filter(t=>!source.includes(t));if(missing.length){console.error(label+' missing: '+missing.join(', '));process.exit(1)}};
const root=JSON.parse(read('package.json')),api=JSON.parse(read('services/api/package.json')),admin=JSON.parse(read('apps/admin/package.json'));
if(root.version!=='4.65.0'||api.version!==root.version||admin.version!==root.version){console.error('Root/API/Admin release identity must be V4.65.0.');process.exit(1)}
for(const file of ['apps/resident/pubspec.yaml','apps/guard/pubspec.yaml'])must(file,read(file),['version: 4.65.0+46500']);
must('V4.65 AutoPay recovery UI',read('apps/resident/lib/screens/billing_screen.dart'),['refreshed = await widget.repository.autopayPreference(unitId: unitId);',"refreshed['enabled'] == enabled",'refreshedMax == maxAmount','refreshedDays == debitDays','AutoPay preference confirmed after reconnect.','The latest server preference is shown; review it before retrying.','String? autopayError;','setState(() => autopayError = refreshed == null']);
must('V4.65 AutoPay recovery regression',read('apps/resident/test/property_scoped_screens_test.dart'),['autopay commit-then-transport failure recovers authoritative preference','autopay unconfirmed failure restores server preference and remains retryable','expect(repository.preferenceReads, greaterThanOrEqualTo(2))',"find.textContaining('latest server preference is shown')"]);
must('V4.65 AutoPay truth',read('docs/AARAAGATE-V4.65-AUTOPAY-PREFERENCE-RECOVERY.md'),['exactly matches all requested preference fields','No client path manufactures an enabled state locally','Staging/main promotion']);
must('V4.65 closure',read('docs/AARAAGATE-V4.65-RELEASE-CLOSURE.md'),['Slice 1: family-member','Slice 2: AutoPay','root/API/Admin: `4.65.0`','Resident/Guard: `4.65.0+46500`']);
console.log('V4.65 AutoPay preference recovery release closure: PASS');
