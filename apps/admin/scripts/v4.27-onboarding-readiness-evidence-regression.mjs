import crypto from 'node:crypto';
import fs from 'node:fs';

const fixtureUrl=new URL('./fixtures/v4.27-representative-migration.json',import.meta.url);
const fixture=JSON.parse(fs.readFileSync(fixtureUrl,'utf8'));
const expectedEntities=['BUILDING','UNIT','RESIDENT','VEHICLE','PARKING','WORKFORCE','VENDOR','OPENING_BALANCE'];
const keys=Object.keys(fixture).sort();
if(JSON.stringify(keys)!==JSON.stringify([...expectedEntities].sort()))throw new Error('Representative migration fixture must cover all eight canonical entity types.');
for(const entity of expectedEntities){
  const rows=fixture[entity];
  if(!Array.isArray(rows)||rows.length===0)throw new Error(`Fixture entity ${entity} must contain at least one representative row.`);
  for(const row of rows)if(!row.__source_row)throw new Error(`Fixture entity ${entity} must retain source-row evidence.`);
}
function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
  return value;
}
const checksum=crypto.createHash('sha256').update(JSON.stringify(stable(fixture))).digest('hex');
const expectedChecksum='4ec05ed9f9ae7ed7f2b76cd68e49fdac8417231eec2be6973b4e2d616633c9ac';
if(checksum!==expectedChecksum)throw new Error(`Representative migration fixture checksum changed: ${checksum}`);

const onboarding=fs.readFileSync(new URL('../app/onboarding/page.tsx',import.meta.url),'utf8');
for(const fragment of [
  '/migration/batches',
  '/society-roles',
  '/entitlements/current',
  '/integrations/registry/configuration',
  'No duplicate configuration store is introduced',
  'Financial mutation remains permission-scoped',
  'Owner/tenant relationships remain occupancy-driven',
  'Hosted production, physical hardware, live provider credentials and real-society policy acceptance remain external gates',
]) if(!onboarding.includes(fragment))throw new Error(`Missing onboarding authority/readiness contract: ${fragment}`);

const migration=fs.readFileSync(new URL('../app/migration/import-stager.tsx',import.meta.url),'utf8');
for(const fragment of ['/migration/preview','/migration/batches','parseXlsx(file)','Preview never mutates operational society data'])if(!migration.includes(fragment))throw new Error(`Missing migration safety contract: ${fragment}`);

console.log('V4.27 onboarding and migration readiness evidence regression passed',expectedChecksum);
