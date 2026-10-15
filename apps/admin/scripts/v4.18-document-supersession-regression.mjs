import fs from 'node:fs'

const page=fs.readFileSync(new URL('../app/documents/page.tsx',import.meta.url),'utf8')

for(const token of [
  'Replace version',
  'Create replacement draft',
  '/replacement',
  'supersedesDocumentId',
  'supersededByDocumentId',
  'atomically archive the prior published version',
  'current published document stays live until the replacement draft is explicitly published',
]){
  if(!page.includes(token)){
    console.error(`Missing V4.18.2 document supersession token: ${token}`)
    process.exit(1)
  }
}
console.log('V4.18.2 document supersession regression passed')
