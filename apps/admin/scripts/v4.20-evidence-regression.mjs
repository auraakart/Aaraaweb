import fs from 'node:fs'

const trace=fs.readFileSync(new URL('../../../docs/REQUIREMENTS-TRACEABILITY.md',import.meta.url),'utf8')
const score=fs.readFileSync(new URL('../../../docs/AARAAGATE-V4-COMPETITIVE-SCORECARD.md',import.meta.url),'utf8')
const completion=fs.readFileSync(new URL('../../../docs/AARAAGATE-V4.20-COMPLETION-EVIDENCE.md',import.meta.url),'utf8')
const program=fs.readFileSync(new URL('../../../docs/AARAAGATE-V4.20-PROGRAM.md',import.meta.url),'utf8')

for(const token of [
  'V2-FAC Assets/AMCs/work orders | P1 | **Implemented / hardened**',
  'V4.20 Facilities, Assets & Work-Order Depth closure',
  'duplicate-safe preventive generation',
]){
  if(!trace.includes(token))throw new Error(`V4.20 traceability evidence missing: ${token}`)
}

for(const token of [
  'Administration/governance | >= 8.7 | **9.6**',
  'Overall repository evidence score: 9.13 / 10',
  'Production/field readiness remains exactly 8.0',
]){
  if(!score.includes(token))throw new Error(`V4.20 score evidence missing: ${token}`)
}

for(const token of [
  'V4.20.1 merged via PR #713',
  'V4.20.2 merged via PR #714',
  'V4.20.3 merged via PR #715',
  'Production/field readiness therefore remains exactly **8.0**',
]){
  if(!completion.includes(token))throw new Error(`V4.20 completion evidence missing: ${token}`)
}

for(const token of [
  'Status: Repository closure complete',
  'V4.20.3 — Contract / preventive maintenance depth — merged via #715',
  'V4.20.4 — Evidence reconciliation — complete',
]){
  if(!program.includes(token))throw new Error(`V4.20 program closure missing: ${token}`)
}

console.log('V4.20 evidence reconciliation: PASS')
