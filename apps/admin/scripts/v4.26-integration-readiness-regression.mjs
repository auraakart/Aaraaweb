import fs from 'node:fs';

const page=fs.readFileSync(new URL('../app/integrations/page.tsx',import.meta.url),'utf8');
const shortcuts=fs.readFileSync(new URL('../app/admin-shortcuts.tsx',import.meta.url),'utf8');
for(const fragment of [
  '/integrations/registry',
  '/integrations/registry/configuration',
  '/integrations/registry/configuration/events',
  "manageRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN'])",
  'Never paste API keys, tokens, credentials or private keys.',
  'Repository readiness does not certify live credentials',
  'contractVersion',
  'retryDisposition',
]) if(!page.includes(fragment)) throw new Error(`Missing V4.26 integration readiness contract: ${fragment}`);
if(!shortcuts.includes("href:'/integrations'")) throw new Error('Admin management navigation must expose Integration readiness.');
if(page.includes('password')&&page.includes('type="password"')) throw new Error('Integration readiness must not collect secrets.');
console.log('V4.26 Admin integration readiness regression passed');
