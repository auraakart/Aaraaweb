import fs from 'node:fs'

const page=fs.readFileSync(new URL('../app/privacy-operations/page.tsx',import.meta.url),'utf8')

for(const token of [
  '/readiness',
  'ReadinessPanel',
  'Case readiness',
  "id:'case-ownership',label:'Case ownership'",
  "id:'due-status',label:'Due status'",
  "id:'active-data-categories',label:'Active data categories'",
  "id:'active-processors',label:'Active processors'",
  "id:'open-privacy-incidents',label:'Open privacy incidents'",
  "id:'grievance-contact',label:'Grievance contact'",
  "id:'server-erasure-blockers',label:'Server erasure blockers'",
  'blockers={readiness?.blockers',
  'nextActions={readiness?.nextActions',
]){
  if(!page.includes(token)){
    console.error(`Missing V4.19.2 privacy readiness contract: ${token}`)
    process.exit(1)
  }
}
console.log('V4.19.2 privacy readiness regression passed')
