import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const json=(path)=>JSON.parse(read(path));
const atLeast=(value,minimum)=>{
  const current=value.split('+')[0].split('.').map(Number);
  for(let i=0;i<minimum.length;i+=1){
    if((current[i]??0)>minimum[i])return true;
    if((current[i]??0)<minimum[i])return false;
  }
  return true;
};

const root=json('package.json');
const api=json('services/api/package.json');
const admin=json('apps/admin/package.json');
assert.ok(atLeast(root.version,[4,83,1]),'Root release identity must be V4.83.1+');
assert.equal(api.version,root.version,'API version must match root');
assert.equal(admin.version,root.version,'Admin version must match root');

for(const path of ['apps/resident/pubspec.yaml','apps/guard/pubspec.yaml']){
  const match=read(path).match(/^version:\s*([^\s]+)/m);
  assert.ok(match&&atLeast(match[1],[4,83,1]),path+' must be V4.83.1+');
}

assert.ok(fs.existsSync('docs/AARAAGATE-V4.83.1-INSTA-SERVICES-ENTRY.md'),'V4.83.1 release note missing');

const services=read('apps/resident/lib/screens/services_screen.dart');
for(const token of [
  "final ApiClient consumerApiClient",
  "Text('Insta Services'",
  "IndependentServicesScreen(",
  "apiClient: widget.consumerApiClient",
  "independentMode: false",
  "find trusted local professionals near your selected property",
]){
  assert.ok(services.includes(token),'Insta Services Services-tab contract missing: '+token);
}

const main=read('apps/resident/lib/main.dart');
assert.ok(
  main.includes('ServicesScreen(controller: controller, consumerApiClient: widget.consumerApiClient)'),
  'Resident shell must pass the authenticated consumer API client into Services'
);

const independent=read('apps/resident/lib/screens/independent_services_screen.dart');
assert.ok(
  independent.includes("widget.independentMode ? 'External Services' : 'Insta Services'"),
  'Resident-mode marketplace must be branded Insta Services'
);
assert.ok(
  independent.includes("widget.independentMode ? 'Services for your home' : 'Insta Services near you'"),
  'Resident-mode marketplace hero must identify Insta Services'
);
assert.ok(
  independent.includes('if (widget.independentMode)'),
  'Resident-mode Insta Services must not start a duplicate independent-mode push lifecycle'
);

const tests=read('apps/resident/test/services_screen_test.dart');
for(const token of [
  'services tab exposes Insta Services and opens the existing local marketplace',
  "expect(find.text('Insta Services'), findsOneWidget)",
  "expect(find.text('Service location'), findsOneWidget)",
]){
  assert.ok(tests.includes(token),'Insta Services regression test missing: '+token);
}

const previous=read('scripts/check-v4.83-automation-convenience-adoption.mjs');
assert.ok(previous.includes('atLeast(root.version,[4,83,0])'),'V4.83 invariant must remain forward-compatible');

const ci=read('.github/workflows/ci.yml');
assert.ok(ci.includes('check-v4.83.1-insta-services-entry.mjs'),'V4.83.1 invariant must run in protected CI');

console.log('V4.83.1 Insta Services Entry: PASS');
