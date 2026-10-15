import fs from 'node:fs';

const source = fs.readFileSync(new URL('../app/governance/page.tsx', import.meta.url), 'utf8');

if (source.includes('prompt(')) {
  throw new Error('Governance workspace must not use browser prompt() flows.');
}

const required = [
  'onSubmit={endTenure}',
  'onSubmit={addAgenda}',
  'onSubmit={addResolution}',
  'onSubmit={addAction}',
  'onSubmit={recordOutcome}',
  'type="datetime-local"',
  'min="0"',
  'Approval rule reference',
  'Bye-law reference',
  'Quorum rule reference',
];

for (const fragment of required) {
  if (!source.includes(fragment)) {
    throw new Error(`Governance operator regression: missing ${fragment}`);
  }
}

console.log('Governance operator workflow regression: PASS');
