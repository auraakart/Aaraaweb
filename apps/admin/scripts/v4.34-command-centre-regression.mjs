import fs from 'node:fs';

const page=fs.readFileSync(new URL('../app/operations-control/page.tsx',import.meta.url),'utf8');
for(const token of [
  '/ai-operations/assistant/action-centre',
  'Operations Command Centre',
  'Needs attention now',
  'domainHref',
  'Open owning workflow',
  'this page never mutates',
  'Domain services, authorization, maker-checker controls and audit trails remain authoritative.',
]){
  if(!page.includes(token)){
    console.error(`V4.34 command centre regression missing: ${token}`);
    process.exit(1);
  }
}
for(const forbidden of ['method:\'POST\'','method:"POST"','method:\'PATCH\'','method:"PATCH"','method:\'DELETE\'','method:"DELETE"']){
  if(page.includes(forbidden)){
    console.error(`V4.34 command centre must remain read-only: ${forbidden}`);
    process.exit(1);
  }
}
console.log('V4.34 Operations Command Centre regression passed.');
