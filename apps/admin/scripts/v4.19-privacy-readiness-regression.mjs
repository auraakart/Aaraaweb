import fs from 'node:fs'

const page=fs.readFileSync(new URL('../app/privacy-operations/page.tsx',import.meta.url),'utf8')

for(const token of [
  '/readiness',
  'Case readiness',
  'Case ownership',
  'Due status',
  'Active data categories',
  'Active processors',
  'Open privacy incidents',
  'Grievance contact',
  'Operational blockers',
  'Server erasure blockers',
  'Next actions',
]){
  if(!page.includes(token)){
    console.error(`Missing V4.19.2 privacy readiness token: ${token}`)
    process.exit(1)
  }
}
console.log('V4.19.2 privacy readiness regression passed')
