import fs from 'node:fs'

const files={
  program:fs.readFileSync(new URL('../../../docs/AARAAGATE-V4.19-PROGRAM.md',import.meta.url),'utf8'),
  score:fs.readFileSync(new URL('../../../docs/AARAAGATE-V4-COMPETITIVE-SCORECARD.md',import.meta.url),'utf8'),
  trace:fs.readFileSync(new URL('../../../docs/REQUIREMENTS-TRACEABILITY.md',import.meta.url),'utf8'),
  evidence:fs.readFileSync(new URL('../../../docs/AARAAGATE-V4.19-COMPLETION-EVIDENCE.md',import.meta.url),'utf8'),
}

for(const token of [
  'Status: Repository closure complete',
  'V4.19.3 — Resident privacy request clarity — merged via #711',
  'V4.19.4 — Evidence reconciliation — complete',
]){
  if(!files.program.includes(token))throw new Error(`V4.19 program missing: ${token}`)
}
for(const token of [
  '**Overall repository evidence score: 9.11 / 10.**',
  '| Administration/governance | >= 8.7 | **9.5** |',
  '| Production/field readiness | >= 8.0 before pilot | **8.0** |',
]){
  if(!files.score.includes(token))throw new Error(`V4.19 scorecard missing: ${token}`)
}
for(const token of [
  'V2-PRV Privacy/data lifecycle',
  '**Implemented / hardened**',
  '## V4.19 Privacy Operations & Data Lifecycle Depth closure',
]){
  if(!files.trace.includes(token))throw new Error(`V4.19 traceability missing: ${token}`)
}
for(const token of [
  'V4.19.1 merged via PR #709',
  'V4.19.2 merged via PR #710',
  'V4.19.3 merged via PR #711',
  'Repository-only evidence score: **9.11 / 10**',
  'Production/field readiness therefore remains exactly **8.0**.',
]){
  if(!files.evidence.includes(token))throw new Error(`V4.19 completion evidence missing: ${token}`)
}
console.log('V4.19 evidence reconciliation: PASS')
