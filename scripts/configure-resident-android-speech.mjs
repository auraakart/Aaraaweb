import fs from 'node:fs';

const manifestPath='apps/resident/android/app/src/main/AndroidManifest.xml';
if(!fs.existsSync(manifestPath)){
  console.error(`Resident Android manifest was not generated at ${manifestPath}`);
  process.exit(1);
}

let source=fs.readFileSync(manifestPath,'utf8');
const permissions=[
  'android.permission.INTERNET',
  'android.permission.RECORD_AUDIO',
];
for(const permission of permissions){
  if(source.includes(`android:name="${permission}"`)) continue;
  source=source.replace(/(<manifest\b[^>]*>)/, `$1\n    <uses-permission android:name="${permission}" />`);
}

if(!source.includes('android.speech.RecognitionService')){
  const applicationIndex=source.indexOf('<application');
  if(applicationIndex<0){
    console.error('Resident Android manifest has no application element');
    process.exit(1);
  }
  const indent=source.slice(0,applicationIndex).match(/(^|\n)([ \t]*)$/)?.[2]??'    ';
  const queries=[
    `${indent}<queries>`,
    `${indent}    <intent>`,
    `${indent}        <action android:name="android.speech.RecognitionService" />`,
    `${indent}    </intent>`,
    `${indent}</queries>`,
    '',
  ].join('\n');
  source=source.slice(0,applicationIndex)+queries+source.slice(applicationIndex);
}

fs.writeFileSync(manifestPath,source);
const configured=fs.readFileSync(manifestPath,'utf8');
for(const required of [
  'android.permission.INTERNET',
  'android.permission.RECORD_AUDIO',
  'android.speech.RecognitionService',
]){
  if(!configured.includes(required)){
    console.error(`Resident Android speech packaging missing ${required}`);
    process.exit(1);
  }
}
console.log('Resident Android speech-recognition packaging prerequisites configured and verified.');
