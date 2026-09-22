import { readFileSync } from 'node:fs';

const admin = readFileSync('apps/admin/app/admin-console.tsx', 'utf8');
const overview = readFileSync('apps/admin/app/admin-overview.tsx', 'utf8');
const primitives = readFileSync('apps/admin/app/admin-ui-primitives.tsx', 'utf8');
const sosRepo = readFileSync('apps/resident/lib/data/sos_repository_extension.dart', 'utf8');
const sosScreen = readFileSync('apps/resident/lib/screens/sos_screen.dart', 'utf8');
const sosModel = readFileSync('apps/resident/lib/data/models/resident_sos_incident.dart', 'utf8');
const capability = readFileSync('docs/CURRENT-CAPABILITY-INDEX.md', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

const fail = (message) => { throw new Error(message); };

if (!admin.includes("from './admin-overview'")) fail('Admin console must import the extracted overview');
if (!admin.includes("from './admin-ui-primitives'")) fail('Admin console must import shared UI primitives');
if (/function Overview\(/.test(admin)) fail('Admin console must not reintroduce the Overview implementation');
if (/function (Header|Metric|MoneyMetric|Badge|Empty)\(/.test(admin)) fail('Admin console must not reintroduce local UI primitives');
if (!overview.includes('export function AdminOverview')) fail('Extracted Admin overview component is required');
for (const name of ['Header','Metric','MoneyMetric','Badge','Empty']) {
  if (!primitives.includes(`export function ${name}`)) fail(`Admin UI primitive ${name} is required`);
}

if (!sosModel.includes('class ResidentSosIncident')) fail('Typed Resident SOS incident model is required');
if (!sosRepo.includes('Future<List<ResidentSosIncident>> sosIncidents()')) fail('Resident SOS list boundary must be typed');
if (!sosRepo.includes('Future<ResidentSosIncident> triggerSos')) fail('Resident SOS trigger boundary must be typed');
if (!sosRepo.includes('Future<ResidentSosIncident> cancelSos')) fail('Resident SOS cancel boundary must be typed');
if (!sosScreen.includes('List<ResidentSosIncident> _incidents')) fail('Resident SOS screen must consume typed incidents');
if (/incident\[['"](?:id|unitId|status|message)['"]\]/.test(sosScreen)) fail('Resident SOS screen must not read core incident fields through raw maps');

if (!capability.includes('V4.41')) fail('Current capability index must identify the V4.41 baseline');
if (pkg.scripts?.['check:v4.41'] !== 'node scripts/check-v4.41-maintainability.mjs') fail('V4.41 check script must stay registered');

console.log('V4.41 maintainability contracts passed');
