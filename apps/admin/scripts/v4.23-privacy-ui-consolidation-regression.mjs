import fs from 'node:fs'

const society=fs.readFileSync(new URL('../app/privacy-operations/page.tsx',import.meta.url),'utf8')
const platform=fs.readFileSync(new URL('../app/platform/privacy/page.tsx',import.meta.url),'utf8')

for(const token of [
  '../../components/admin-ui',
  'PageShell',
  'PageHeader',
  'QueuePanel',
  'DetailPanel',
  'ReadinessPanel',
  'EvidenceGrid',
  'Timeline',
  'DangerButton',
  'detailRequest.current',
  "setHistory([]);setPlan(null);setReadiness(null)",
  'I confirm I reviewed this plan',
]){
  if(!society.includes(token)){
    console.error(`Missing society Privacy consolidation contract: ${token}`)
    process.exit(1)
  }
}

for(const token of [
  '../../../components/admin-ui',
  "s.role!=='SUPER_ADMIN'",
  'SelectField',
  'FormField',
  'DangerButton',
  'Preview plan',
  'I confirm I reviewed the server-authoritative plan',
  '/platform/privacy/cases/',
]){
  if(!platform.includes(token)){
    console.error(`Missing platform Privacy consolidation contract: ${token}`)
    process.exit(1)
  }
}

for(const source of [society,platform]){
  for(const forbidden of ['prompt(', 'alert(', 'confirm(']){
    if(source.includes(forbidden)){
      console.error(`Privacy consolidation must not use browser dialog: ${forbidden}`)
      process.exit(1)
    }
  }
}

for(const forbidden of [
  "background:'#05879A'",
  "background:'#991b1b'",
  'const primary:React.CSSProperties',
  'const secondary:React.CSSProperties',
  'const danger:React.CSSProperties',
]){
  if(society.includes(forbidden)||platform.includes(forbidden)){
    console.error(`Legacy Privacy presentation survived consolidation: ${forbidden}`)
    process.exit(1)
  }
}

console.log('V4.23 Privacy Admin consolidation regression passed')
