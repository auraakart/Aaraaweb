import assert from 'node:assert/strict';
import fs from 'node:fs';

const hotspotPaths = [
  'services/api/src/amenities/amenities.service.ts',
  'services/api/src/billing/billing.service.ts',
  'services/api/src/ai-operations/ai-assistant.service.ts',
  'apps/resident/lib/data/resident_data_controller.dart',
];

const allowed = new Set([
  'scripts/check-complexity-boundaries.mjs',
  'scripts/check-v4.81.5-maintainability-hygiene.mjs',
  'scripts/check-source-contract-extraction-resilience.mjs',
]);

const offenders = [];
for (const name of fs.readdirSync('scripts')) {
  if (!/^check-v.*\.mjs$/.test(name)) continue;
  const path = 'scripts/' + name;
  if (allowed.has(path)) continue;
  const source = fs.readFileSync(path, 'utf8');
  for (const hotspot of hotspotPaths) {
    const directReadPatterns = [
      "read('" + hotspot + "')",
      'read("' + hotspot + '")',
      "readFileSync('" + hotspot + "'",
      'readFileSync("' + hotspot + '"',
    ];
    if (directReadPatterns.some((token) => source.includes(token))) offenders.push({ path, hotspot });
  }
}

assert.deepEqual(
  offenders,
  [],
  'Historical source contracts must use scripts/lib/source-contract-bundles.mjs for decomposable hotspot domains: ' +
    JSON.stringify(offenders),
);

const bundles = fs.readFileSync('scripts/lib/source-contract-bundles.mjs', 'utf8');
for (const path of [
  'services/api/src/amenities/amenity-booking-creator.ts',
  'services/api/src/ai-operations/ai-society-insights.ts',
  'services/api/src/billing/payment-order.service.ts',
  'apps/resident/lib/data/resident_guest_invite_coordinator.dart',
]) {
  assert.ok(bundles.includes(path), 'Extraction-aware bundle missing current boundary: ' + path);
}

console.log('Historical source-contract extraction resilience: PASS');
