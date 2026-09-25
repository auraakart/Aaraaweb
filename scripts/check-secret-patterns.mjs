import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const patterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ['GitHub fine-grained token', /\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['OpenAI-style secret', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
];

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const findings = [];
for (const file of files) {
  let stat;
  try { stat = fs.statSync(file); } catch { continue; }
  if (!stat.isFile() || stat.size > 2_000_000) continue;
  const raw = fs.readFileSync(file);
  if (raw.includes(0)) continue;
  const text = raw.toString('utf8');
  for (const [label, pattern] of patterns) {
    if (pattern.test(text)) findings.push({ file, label });
  }
}

if (findings.length) {
  console.error('High-confidence secret patterns found in tracked source:');
  for (const finding of findings) console.error(`- ${finding.file}: ${finding.label}`);
  process.exit(1);
}
console.log(`Tracked-secret scan passed across ${files.length} tracked paths.`);
