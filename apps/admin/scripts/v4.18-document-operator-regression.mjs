import fs from 'node:fs'

const page=fs.readFileSync(new URL('../app/documents/page.tsx',import.meta.url),'utf8')

for(const token of [
  '/documents/management/context',
  "audience==='PROPERTY_OWNER_ONLY'",
  "unitId:audience==='PROPERTY_OWNER_ONLY'?unitId:undefined",
  'Select property',
  'Document history',
  '/history',
  'Append-only lifecycle evidence',
  'buildingName',
  'unitNumber',
]){
  if(!page.includes(token)){
    console.error(`Missing V4.18.1 document operator token: ${token}`)
    process.exit(1)
  }
}
console.log('V4.18.1 document operator regression passed')
