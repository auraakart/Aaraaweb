import fs from 'node:fs';

const path='services/api/src/amenities/amenities-attendance.spec.ts';
const source=fs.readFileSync(path,'utf8');

const required=[
  'function sqlText(queryRaw:ReturnType<typeof vi.fn>)',
  "expect(sql).toContain('pg_advisory_xact_lock')",
  'expect(sql).not.toContain',
  '"status"=\\\'NO_SHOW\\\'',
  '"status"=\\\'CHECKED_IN\\\'',
];

const missing=required.filter(token=>!source.includes(token));
if(missing.length){
  console.error(`V4.77.1 attendance test contract missing: ${missing.join(', ')}`);
  process.exit(1);
}

const prohibited=[
  /toHaveBeenCalledTimes\s*\(/,
  /mock\.calls\s*\[\s*\d+\s*\]/,
];

for(const pattern of prohibited){
  if(pattern.test(source)){
    console.error(`V4.77.1 attendance tests must assert behavior, not SQL call count/position: ${pattern}`);
    process.exit(1);
  }
}

console.log('V4.77.1 amenity attendance test-contract resilience is intact.');
