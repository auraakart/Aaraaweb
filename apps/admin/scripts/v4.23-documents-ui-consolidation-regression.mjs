import fs from 'node:fs'

const page=fs.readFileSync(new URL('../app/documents/page.tsx',import.meta.url),'utf8')

for(const token of [
  '../../components/admin-ui',
  'PageShell',
  'PageHeader',
  'ErrorState',
  'FormField',
  'SelectField',
  'PrimaryButton',
  'SecondaryButton',
  'StatusPill',
  'Timeline',
  '/documents/management/upload-intent',
  '/documents/management/context',
  '/download-intent',
  '/replacement',
  '/history',
  "audience==='PROPERTY_OWNER_ONLY'",
  "unitId:audience==='PROPERTY_OWNER_ONLY'?unitId:undefined",
  'Select property',
  'Replace version',
  'Create replacement draft',
  'current published document stays live until the replacement draft is explicitly published',
  'atomically archive the prior published version',
  'Append-only lifecycle evidence',
  'historyRequest.current',
  'noopener,noreferrer',
]){
  if(!page.includes(token)){
    console.error(`Documents consolidation missing contract: ${token}`)
    process.exit(1)
  }
}

for(const forbidden of [
  "background:'#05879A'",
  'const primary:React.CSSProperties',
  'const secondary:React.CSSProperties',
  'prompt(',
  'alert(',
  'confirm(',
]){
  if(page.includes(forbidden)){
    console.error(`Documents consolidation retained forbidden legacy pattern: ${forbidden}`)
    process.exit(1)
  }
}

for(const token of ['supersedesDocumentId','supersededByDocumentId','buildingName','unitNumber']){
  if(!page.includes(token)){
    console.error(`Documents lineage/property evidence missing: ${token}`)
    process.exit(1)
  }
}

console.log('V4.23 Documents Admin consolidation regression passed')
