import fs from 'node:fs';

export const readContractFile = (path) => fs.readFileSync(path, 'utf8');

const bundles = {
  amenities: [
    'services/api/src/amenities/amenities.service.ts',
    'services/api/src/amenities/amenity-booking-creator.ts',
    'services/api/src/amenities/amenity-policy.engine.ts',
    'services/api/src/amenities/amenity-analytics.query.ts',
  ],
  billing: [
    'services/api/src/billing/billing.service.ts',
    'services/api/src/billing/payment-order.service.ts',
    'services/api/src/billing/payment-webhook.processor.ts',
  ],
  aiAssistant: [
    'services/api/src/ai-operations/ai-assistant.service.ts',
    'services/api/src/ai-operations/ai-society-insights.ts',
    'services/api/src/ai-operations/ai-assistant.policy.ts',
  ],
  residentController: [
    'apps/resident/lib/data/resident_data_controller.dart',
    'apps/resident/lib/data/resident_data_loading.dart',
    'apps/resident/lib/data/resident_workforce_history.dart',
    'apps/resident/lib/data/resident_guest_invite_coordinator.dart',
  ],
};

export function readContractBundle(name) {
  const paths = bundles[name];
  if (!paths) throw new Error('Unknown source-contract bundle: ' + name);
  return paths
    .filter((path) => fs.existsSync(path))
    .map((path) => `/* source: ${path} */\n${readContractFile(path)}`)
    .join('\n');
}

export const contractBundlePaths = Object.freeze(
  Object.fromEntries(Object.entries(bundles).map(([name, paths]) => [name, Object.freeze([...paths])])),
);
