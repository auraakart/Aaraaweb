import fs from 'node:fs'

const page=fs.readFileSync(new URL('../app/occupancy-lifecycle/page.tsx',import.meta.url),'utf8')

for(const token of [
  '../../components/admin-ui',
  'PageShell',
  'PageHeader',
  'QueuePanel',
  'DetailPanel',
  'ReadinessPanel',
  'EvidenceGrid',
  'FormField',
  'SelectField',
  'PrimaryButton',
  'SecondaryButton',
  'DangerButton',
  'StatusPill',
  'Timeline',
  '/occupancy-lifecycle/operator-context',
  '/occupancy-lifecycle/move-ins/by-phone',
  '/occupancy-lifecycle/move-outs',
  '/readiness',
  'Registered mobile',
  'Select unit',
  'Select resident occupancy',
  'Review decision',
  'Operational note (optional)',
  'Document / file reference',
  'Verification note (optional)',
  'Operational handover evidence',
  'Required checklist',
  'Verified documents',
  'Active vehicles',
  'Active workforce',
  'Parking allocations',
  'Current gate authority',
  'These signals are descriptive and do not by themselves block completion',
  'detailRequest.current',
  'aria-pressed',
]){
  if(!page.includes(token)){
    console.error(`Occupancy consolidation missing contract: ${token}`)
    process.exit(1)
  }
}

for(const forbidden of [
  'prompt(',
  'alert(',
  'confirm(',
  'Unit ID<input',
  'User ID<input',
  'Active occupancy ID<input',
  "background:'#111827'",
  "background:'#991b1b'",
  'const button=',
  'const secondary=',
  'const danger=',
]){
  if(page.includes(forbidden)){
    console.error(`Occupancy consolidation retained forbidden legacy pattern: ${forbidden}`)
    process.exit(1)
  }
}

console.log('V4.23 Occupancy Admin consolidation regression passed')
