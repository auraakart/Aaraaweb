import fs from 'node:fs';

const budgets = new Map([
  ['services/api/src/amenities/amenities.service.ts', 1050],
  ['services/api/src/ai-operations/ai-assistant.service.ts', 580],
  ['services/api/src/billing/billing.service.ts', 425],
  ['apps/resident/lib/data/resident_data_controller.dart', 850],
  ['apps/guard/lib/screens/guard_operations_screen.dart', 360],
]);

for (const [path, maxLines] of budgets) {
  const source = fs.readFileSync(path, 'utf8');
  const lines = source.split(/\r?\n/).length;
  if (lines > maxLines) {
    console.error(`${path} has ${lines} lines; V4.81.2 complexity budget is ${maxLines}. Extract a bounded domain component instead of growing this hotspot.`);
    process.exit(1);
  }
}

const requiredBoundaries = [
  'services/api/src/amenities/amenity-policy.engine.ts',
  'services/api/src/amenities/amenity-analytics.query.ts',
  'services/api/src/amenities/amenity-booking-creator.ts',
  'services/api/src/ai-operations/ai-assistant.policy.ts',
  'services/api/src/ai-operations/ai-society-insights.ts',
  'services/api/src/billing/payment-webhook.processor.ts',
  'services/api/src/billing/payment-order.service.ts',
  'services/api/src/auth/property-finance-access.ts',
  'services/api/src/auth/property-scope.sql.ts',
  'services/api/src/reliability/http-security.ts',
  'apps/resident/lib/data/resident_state_snapshots.dart',
  'apps/resident/lib/data/resident_data_loading.dart',
  'apps/resident/lib/data/resident_guest_invite_coordinator.dart',
  'apps/guard/lib/screens/guard_operations_components.dart',
  'scripts/check-stable-domain-invariants.mjs',
];

for (const path of requiredBoundaries) {
  if (!fs.existsSync(path)) {
    console.error(`V4.81 architecture boundary is missing: ${path}`);
    process.exit(1);
  }
}

const amenities = fs.readFileSync('services/api/src/amenities/amenities.service.ts', 'utf8');
if (!amenities.includes('private readonly policy = new AmenityPolicyEngine()')) {
  console.error('AmenitiesService must delegate pure policy evaluation to AmenityPolicyEngine.');
  process.exit(1);
}
const resident = fs.readFileSync('apps/resident/lib/data/resident_data_controller.dart', 'utf8');
if (!resident.includes('ResidentHouseholdSnapshot') || !resident.includes('ResidentWorkforceSnapshot')) {
  console.error('ResidentDataController must retain extracted household/workforce snapshot boundaries.');
  process.exit(1);
}

console.log('Architecture complexity boundaries: PASS');
