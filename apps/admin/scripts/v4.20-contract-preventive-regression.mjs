import fs from 'node:fs'

const contracts=fs.readFileSync(new URL('../app/facilities/contracts/page.tsx',import.meta.url),'utf8')
const preventive=fs.readFileSync(new URL('../app/facilities/preventive/page.tsx',import.meta.url),'utf8')

for(const token of [
  'maintenancePlanTitle',
  'maintenancePlanActive',
  'maintenancePlanNextDueAt',
  'Plan:',
]){
  if(!contracts.includes(token)){
    console.error(`Missing V4.20.3 contract linkage token: ${token}`)
    process.exit(1)
  }
}

for(const token of [
  '/evidence',
  'Plan evidence',
  'Generated work orders',
  'Linked contracts',
  'Maintenance evidence',
  'planEvidence.boundary',
]){
  if(!preventive.includes(token)){
    console.error(`Missing V4.20.3 preventive evidence token: ${token}`)
    process.exit(1)
  }
}

console.log('V4.20.3 contract/preventive regression passed')
