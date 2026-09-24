import fs from 'node:fs';
import path from 'node:path';

const [output, ...inputs] = process.argv.slice(2);
if (!output || inputs.length === 0) {
  console.error('usage: node scripts/generate-v4.55-sbom.mjs <output> <dependency-json>...');
  process.exit(2);
}

const components = new Map();
const clean = (value) => String(value ?? '').trim();

function add(name, version, ecosystem) {
  name = clean(name);
  version = clean(version);
  if (!name || !version || version === 'undefined') return;
  const key = `${ecosystem}:${name}@${version}`;
  if (components.has(key)) return;
  const encodedName = ecosystem === 'npm'
    ? name.split('/').map(encodeURIComponent).join('/')
    : encodeURIComponent(name);
  components.set(key, {
    type: 'library',
    name,
    version,
    purl: `pkg:${ecosystem}/${encodedName}@${encodeURIComponent(version)}`,
    properties: [{ name: 'aaraagate:source', value: ecosystem }],
  });
}

function walk(value, ecosystem, keyHint = '') {
  if (Array.isArray(value)) {
    for (const entry of value) walk(entry, ecosystem);
    return;
  }
  if (!value || typeof value !== 'object') return;

  const name = clean(value.name || keyHint);
  const version = clean(value.version);
  if (name && version) add(name, version, ecosystem);

  for (const [key, child] of Object.entries(value)) {
    if (key === 'name' || key === 'version') continue;
    if (child && typeof child === 'object') walk(child, ecosystem, key);
  }
}

for (const input of inputs) {
  const data = JSON.parse(fs.readFileSync(input, 'utf8'));
  const ecosystem = /pub-deps/i.test(path.basename(input)) ? 'pub' : 'npm';
  walk(data, ecosystem);
}

const bom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  version: 1,
  metadata: {
    component: {
      type: 'application',
      name: 'aaraagate',
      version: '4.55.0',
    },
    properties: [
      { name: 'aaraagate:sbom-scope', value: 'resolved CI dependency inventories' },
      { name: 'aaraagate:truth-boundary', value: 'SBOM is build evidence, not vulnerability or license certification' },
    ],
  },
  components: [...components.values()].sort((a, b) => a.purl.localeCompare(b.purl)),
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(bom, null, 2) + '\n');
if (bom.components.length === 0) {
  console.error('SBOM generation produced no components.');
  process.exit(1);
}
console.log(`Generated CycloneDX 1.6 SBOM with ${bom.components.length} components.`);
