import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const must=(label,source,tokens)=>{const missing=tokens.filter(t=>!source.includes(t));if(missing.length){console.error(label+' missing: '+missing.join(', '));process.exit(1)}};
const root=JSON.parse(read('package.json')),api=JSON.parse(read('services/api/package.json')),admin=JSON.parse(read('apps/admin/package.json'));
if(root.version!=='4.66.0'||api.version!==root.version||admin.version!==root.version){console.error('Root/API/Admin release identity must be V4.66.0.');process.exit(1)}
for(const file of ['apps/resident/pubspec.yaml','apps/guard/pubspec.yaml'])must(file,read(file),['version: 4.66.0+46600']);
const controller=read('apps/resident/lib/data/resident_data_controller.dart');
must('V4.66 authoritative request recovery',controller,['pendingHouseholdChangeRequests(','_hasPendingFamilyAdd(','_hasPendingFamilyRemove(','_hasPendingVehicleAdd(','_hasPendingVehicleRemove(','Future<void> addVehicle({','Future<void> deactivateVehicle({',"const {'PENDING', 'PROCESSING'}"]);
must('V4.66 repository convergence',read('apps/resident/lib/data/resident_repository.dart'),['Future<Map<String, dynamic>> addVehicle({','Future<void> deactivateVehicle({required String householdId']);
const family=read('apps/resident/lib/screens/family_members_screen.dart'),vehicles=read('apps/resident/lib/screens/vehicles_screen.dart');
must('V4.66 family pending visibility',family,["typePrefix: 'FAMILY_MEMBER_'"]);
must('V4.66 vehicle pending visibility',vehicles,["typePrefix: 'VEHICLE_'",'await controller.addVehicle(','await controller.deactivateVehicle(']);
for(const token of ['controller.repository.addVehicle(','controller.repository.deactivateVehicle('])if(vehicles.includes(token)){console.error('Direct vehicle repository mutation remains: '+token);process.exit(1)}
must('V4.66 focused regression',read('apps/resident/test/household_change_request_recovery_test.dart'),['family add recovers from the authoritative pending approval request','family removal recovers while the active member remains pending approval','vehicle add and remove recover from authoritative pending requests','does not manufacture vehicle success when no authoritative request exists']);
must('V4.66 truth',read('docs/AARAAGATE-V4.66-HOUSEHOLD-REQUEST-RECOVERY.md'),['approval-request operations rather than immediate active-state mutations','PENDING/PROCESSING','never becomes client-side success']);
console.log('V4.66 household approval-request recovery release closure: PASS');
