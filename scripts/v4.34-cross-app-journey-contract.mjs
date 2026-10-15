import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

async function collect(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await collect(path));
    else if (/\.(?:ts|tsx|dart)$/.test(entry.name)) files.push(path);
  }
  return files;
}

async function source(root) {
  const files = await collect(root);
  return (await Promise.all(files.map(file => readFile(file, 'utf8')))).join('\n');
}

const [resident, guard, admin, api] = await Promise.all([
  source('apps/resident/lib'),
  source('apps/guard/lib'),
  source('apps/admin/app'),
  source('services/api/src'),
]);

const journeys = [
  {
    id: 'GATE',
    assertions: [
      [resident, '/access-requests/visitor-invites', 'Resident visitor invite boundary'],
      [guard, '/access-requests/gate/verify', 'Guard credential verification boundary'],
      [guard, '/access-requests/gate/check-in', 'Guard check-in boundary'],
      [api, 'AccessModule', 'API access module'],
      [admin, '/reports/access', 'Admin access evidence/report boundary'],
    ],
  },
  {
    id: 'PAYMENTS',
    assertions: [
      [resident, '/billing/invoices/payable', 'Resident payable invoice boundary'],
      [resident, '/billing/payments', 'Resident payment initiation/history boundary'],
      [api, 'BillingModule', 'API billing module'],
      [api, 'AccountingModule', 'API accounting truth boundary'],
      [admin, '/finance', 'Admin finance workspace'],
    ],
  },
  {
    id: 'OCCUPANCY',
    assertions: [
      [resident, '/occupancy', 'Resident occupancy lifecycle boundary'],
      [api, 'ResidentsModule', 'API resident/occupancy module'],
      [admin, '/occupancy-lifecycle', 'Admin occupancy lifecycle workspace'],
    ],
  },
  {
    id: 'HELPDESK',
    assertions: [
      [resident, '/helpdesk', 'Resident helpdesk boundary'],
      [api, 'HelpdeskModule', 'API helpdesk module'],
      [admin, '/helpdesk', 'Admin helpdesk workspace'],
    ],
  },
  {
    id: 'AMENITIES',
    assertions: [
      [resident, '/amenities', 'Resident amenity boundary'],
      [api, 'AmenitiesModule', 'API amenities module'],
      [admin, '/amenities', 'Admin amenity workspace'],
    ],
  },
  {
    id: 'PARCELS',
    assertions: [
      [resident, '/parcels', 'Resident parcel boundary'],
      [guard, '/parcels/desk', 'Guard parcel desk boundary'],
      [api, 'ParcelsModule', 'API parcel module'],
      [admin, '/parcels', 'Admin parcel desk workspace'],
    ],
  },
];

const missing = [];
for (const journey of journeys) {
  for (const [haystack, needle, label] of journey.assertions) {
    if (!haystack.includes(needle)) missing.push(`${journey.id}: ${label} missing ${needle}`);
  }
}
if (missing.length) {
  console.error('V4.34 cross-app journey contract failed:\n' + missing.join('\n'));
  process.exit(1);
}
console.log(JSON.stringify({
  contract: 'v4.34-cross-app-journeys',
  journeys: journeys.map(item => item.id),
  boundary: 'Source-contract alignment complements the live HTTP visitor journey; it does not claim field/device/provider acceptance.',
  passed: true,
}, null, 2));
