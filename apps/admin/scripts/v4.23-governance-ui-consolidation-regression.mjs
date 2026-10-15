import fs from 'node:fs'

const workspace=fs.readFileSync(new URL('../app/governance/page.tsx',import.meta.url),'utf8')
const polls=fs.readFileSync(new URL('../app/governance/polls/page.tsx',import.meta.url),'utf8')
const readiness=fs.readFileSync(new URL('../app/governance/readiness/page.tsx',import.meta.url),'utf8')

for(const [name,source] of [['workspace',workspace],['polls',polls],['readiness',readiness]]){
  if(!source.includes('components/admin-ui')){
    console.error(`Governance ${name} missing shared Admin UI import`)
    process.exit(1)
  }
  if(!source.includes('PageShell')||!source.includes('PageHeader')){
    console.error(`Governance ${name} missing shared shell/header`)
    process.exit(1)
  }
  for(const forbidden of ['prompt(','alert(','confirm(']){
    if(source.includes(forbidden)){
      console.error(`Governance ${name} retained browser dialog: ${forbidden}`)
      process.exit(1)
    }
  }
}

for(const token of [
  'QueuePanel',
  'DetailPanel',
  'EvidenceGrid',
  'StatusPill',
  'Timeline',
  'onSubmit={endTenure}',
  'onSubmit={addAgenda}',
  'onSubmit={addResolution}',
  'onSubmit={addAction}',
  'onSubmit={recordOutcome}',
  'Action follow-through',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'OVERDUE',
  'Follow up',
  '/status',
  'Approval rule reference',
  'Bye-law reference',
  'Quorum rule reference',
  'detailRequest.current',
  '/governance/readiness',
]){
  if(!workspace.includes(token)){
    console.error(`Governance workspace consolidation missing: ${token}`)
    process.exit(1)
  }
}

for(const token of [
  'intentionally separated from statutory society voting and legal resolutions',
  'Non-statutory use enforced',
  'statutoryUseProhibited',
  '/governance/community-polls/',
  'DangerButton',
]){
  if(!polls.includes(token)){
    console.error(`Governance polls consolidation missing boundary/control: ${token}`)
    process.exit(1)
  }
}

for(const token of [
  'ReadinessPanel',
  'Governance readiness & closure evidence',
  'does not determine legal validity',
  'quorumComparison',
  'Recorded count meets/exceeds configured count',
  'Recorded count is below configured count',
  'approvalConfigured',
  'unresolvedResolutions',
  'evidenceEvents',
  'operational completeness checklist only',
  'detailRequest.current',
  'State-specific law, registered bye-laws, notices, voting rules and external records remain authoritative outside this repository',
]){
  if(!readiness.includes(token)){
    console.error(`Governance readiness consolidation missing: ${token}`)
    process.exit(1)
  }
}

if(readiness.includes('legally valid')||readiness.includes('statutorily compliant')){
  console.error('Governance readiness must not assert legal validity or statutory compliance.')
  process.exit(1)
}

console.log('V4.23 Governance Admin consolidation regression passed')
