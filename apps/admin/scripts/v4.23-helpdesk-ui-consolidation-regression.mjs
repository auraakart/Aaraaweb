import fs from 'node:fs'

const page=fs.readFileSync(new URL('../app/helpdesk/page.tsx',import.meta.url),'utf8')

for(const token of [
  '../../components/admin-ui',
  'PageShell',
  'PageHeader',
  'QueuePanel',
  'DetailPanel',
  'ReadinessPanel',
  'StatusPill',
  'FormField',
  'SelectField',
  'PrimaryButton',
  'SecondaryButton',
  'EmptyState',
  'ErrorState',
  'Timeline',
  'EvidenceGrid',
  'ActionBar',
  'detailRequest.current',
  "setActivities([]);setSlaHistory([]);setReadiness(null)",
  "aria-pressed={t.id===selectedId}",
]){
  if(!page.includes(token)){
    console.error(`Missing V4.23 Helpdesk consolidation contract: ${token}`)
    process.exit(1)
  }
}
for(const forbidden of [
  "background:'#0f766e'",
  "gridTemplateColumns:'minmax(320px,.85fr) minmax(420px,1.6fr)'",
  'const primary:React.CSSProperties',
  'const secondary:React.CSSProperties',
  'const panel:React.CSSProperties',
]){
  if(page.includes(forbidden)){
    console.error(`Legacy Helpdesk presentation survived V4.23 consolidation: ${forbidden}`)
    process.exit(1)
  }
}
console.log('V4.23 Helpdesk Admin consolidation regression passed')
