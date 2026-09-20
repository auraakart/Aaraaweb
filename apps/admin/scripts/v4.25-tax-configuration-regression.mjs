import fs from 'node:fs';

const source = fs.readFileSync(new URL('../app/finance/tax/page.tsx', import.meta.url), 'utf8');
const finance = fs.readFileSync(new URL('../app/finance/page.tsx', import.meta.url), 'utf8');

const required = [
  '/accounting/tax/configuration',
  'gstEnabled',
  'tdsEnabled',
  'Default TDS rate (%)',
  'does not determine statutory applicability',
  "manageRoles=new Set(['SUPER_ADMIN','ACCOUNTANT'])",
];
for (const fragment of required) {
  if (!source.includes(fragment)) throw new Error(`Missing V4.25 tax configuration contract: ${fragment}`);
}
if (!finance.includes('href="/finance/tax"')) throw new Error('Finance workspace must expose GST / TDS configuration.');
if (source.includes('/accounting/tax/metadata') && !source.includes('document')) throw new Error('Tax metadata UI must stay document-scoped.');
console.log('V4.25 tax configuration regression passed');
