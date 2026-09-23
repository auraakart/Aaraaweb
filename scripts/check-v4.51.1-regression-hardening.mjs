import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const requireTokens=(label,source,tokens)=>{
  const missing=tokens.filter(token=>!source.includes(token));
  if(missing.length){console.error(`${label} missing: ${missing.join(', ')}`);process.exit(1)}
};

const postMain=read('.github/workflows/post-main-health.yml');
if(postMain.includes('git merge-base')){
  console.error('V4.51.1 regression: post-main health must not use ancestry-only merge-base containment after squash promotion');
  process.exit(1);
}
requireTokens('Squash-aware post-main health',postMain,[
  'git diff --quiet "$DEVELOP_SHA" "$MAIN_SHA" -- .',
  'git diff --quiet "$STAGING_SHA" "$MAIN_SHA" -- .',
  'MAIN_TREE="$(git rev-parse "$MAIN_SHA^{tree}")"',
  "sourceEquivalence:'ok'",
]);

const speechPackaging=read('scripts/configure-resident-android-speech.mjs');
requireTokens('Resident speech packaging',speechPackaging,[
  'android.permission.RECORD_AUDIO',
  'android.permission.INTERNET',
  'android.speech.RecognitionService',
  'speech-recognition packaging prerequisites configured and verified',
]);

const apkWorkflow=read('.github/workflows/resident-demo-apk.yml');
requireTokens('Resident APK speech packaging gate',apkWorkflow,[
  'Configure and verify Resident speech recognition permissions',
  'node scripts/configure-resident-android-speech.mjs',
  'Build debug APK',
]);

const capability=read('docs/CURRENT-CAPABILITY-INDEX.md');
requireTokens('V4.51.1 capability evidence',capability,[
  'V4.51.1 Post-Release Regression Hardening',
  'squash-promotion aware',
  'microphone/speech-recognition manifest requirements',
]);

const milestone=read('docs/AARAAGATE-V4.51.1-POST-RELEASE-REGRESSION-HARDENING.md');
requireTokens('V4.51.1 milestone evidence',milestone,[
  'Post-main health',
  'Resident voice packaging',
  'Branch protection',
  'No application-domain behavior is changed',
]);

console.log('V4.51.1 post-release regression-hardening contracts are intact.');
