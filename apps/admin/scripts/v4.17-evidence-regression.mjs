import fs from 'node:fs'

const trace=fs.readFileSync(new URL('../../../docs/REQUIREMENTS-TRACEABILITY.md',import.meta.url),'utf8')
const score=fs.readFileSync(new URL('../../../docs/AARAAGATE-V4-COMPETITIVE-SCORECARD.md',import.meta.url),'utf8')
const completion=fs.readFileSync(new URL('../../../docs/AARAAGATE-V4.17-COMPLETION-EVIDENCE.md',import.meta.url),'utf8')
const program=fs.readFileSync(new URL('../../../docs/AARAAGATE-V4.17-PROGRAM.md',import.meta.url),'utf8')

for(const token of [
  'V2-OCC Move-in/move-out and tenancy lifecycle | P0 | **Implemented / hardened**',
  'V4.17 Occupancy Lifecycle & Property Operations Depth closure',
  'server-authoritative',
]){
  if(!trace.includes(token)) throw new Error(`V4.17 traceability evidence missing: ${token}`)
}

for(const token of [
  'Resident experience/features | >= 9.0 | **9.5**',
  'Administration/governance | >= 8.7 | **9.3**',
  'Overall repository evidence score: 9.09 / 10',
  'Production/field readiness remains exactly 8.0',
]){
  if(!score.includes(token)) throw new Error(`V4.17 score evidence missing: ${token}`)
}

for(const token of [
  'V4.17.1 merged via PR #701',
  'V4.17.2 merged via PR #702',
  'V4.17.3 merged via PR #703',
  'Production/field readiness therefore remains exactly **8.0**',
]){
  if(!completion.includes(token)) throw new Error(`V4.17 completion evidence missing: ${token}`)
}

for(const token of [
  'Status: Repository closure complete',
  'V4.17.3 — Resident move experience — merged via #703',
  'V4.17.4 — Evidence reconciliation — complete',
]){
  if(!program.includes(token)) throw new Error(`V4.17 program closure missing: ${token}`)
}

console.log('V4.17 evidence reconciliation: PASS')
