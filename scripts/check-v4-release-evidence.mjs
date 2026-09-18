import fs from 'node:fs';

const manifestPath='docs/v4-release-manifest.json';
const requiredFiles=[
  'docs/AARAAGATE-V4-PROGRAM.md',
  'docs/AARAAGATE-V4-COMPETITIVE-SCORECARD.md',
  'docs/AARAAGATE-V4-RELEASE-EVIDENCE.md',
  'docs/STAGING-RELEASE-EVIDENCE.md',
  'docs/HOSTED-STAGING-ACCEPTANCE.md',
  'docs/DEPLOYMENT-ROLLBACK-GATES.md',
  'docs/UAT-PILOT-CHECKLIST.md',
  '.github/workflows/ci.yml',
  '.github/workflows/backup-restore-smoke.yml',
  '.github/workflows/release-readiness.yml',
  'scripts/release-migration-gate.sh',
  'scripts/production-preflight.sh',
];
for(const file of requiredFiles){
  if(!fs.existsSync(file)) throw new Error(`Missing V4 release evidence/control: ${file}`);
}
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
if(manifest.version!=='4.0') throw new Error('Unexpected V4 manifest version');
if(!Array.isArray(manifest.milestones)||manifest.milestones.length!==8) throw new Error('V4.1-V4.8 milestone evidence must be present');
for(let n=1;n<=8;n++){
  if(!manifest.milestones.some((m)=>m.id===`V4.${n}`)) throw new Error(`Missing V4.${n} evidence`);
}
if(typeof manifest.scorecard?.overall!=='number'||manifest.scorecard.overall<8.6) throw new Error('V4 competitive repository score is below 8.6 release criterion');
if(manifest.scorecard.productionFieldReadiness<8.0) throw new Error('V4 production/field readiness evidence is below pre-pilot target');
if(!Array.isArray(manifest.externalProofsRemaining)||manifest.externalProofsRemaining.length<5) throw new Error('External proof boundary must remain explicit');
if(manifest.releasePromotionApproved!==false) throw new Error('Repository consolidation must not self-approve staging/main promotion');
const evidence=fs.readFileSync('docs/AARAAGATE-V4-RELEASE-EVIDENCE.md','utf8');
for(const phrase of ['Repository evidence','Hosted release evidence','staging','main','P0/P1']){
  if(!evidence.includes(phrase)) throw new Error(`Release evidence missing required boundary: ${phrase}`);
}
console.log(`V4 release consolidation contract valid: score ${manifest.scorecard.overall.toFixed(2)}, ${manifest.milestones.length} milestones evidenced.`);
