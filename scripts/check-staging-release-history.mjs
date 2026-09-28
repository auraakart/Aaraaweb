#!/usr/bin/env node
const RELEASE_SUBJECT = /^(?:release(?:\([^\r\n)]{1,80}\))?:|chore\(release\):)/i;

export function isReleaseHistorySubject(subject) {
  return RELEASE_SUBJECT.test(String(subject ?? '').trim());
}

function selfTest() {
  const accepted = [
    'Release: promote exact V4.68 develop tree to staging',
    'release: promote Aaraagate V4.70',
    'release(v4.68): exact develop tree staging candidate',
    'release(V4.70.1): exact develop tree staging candidate',
    'chore(release): reconcile V4.51 main history into V4.52 staging',
  ];
  const rejected = [
    'feat: change resident billing behavior',
    'fix(helpdesk): patch assignment',
    'Merge pull request #123 from auraakart/feature/foo',
    '',
  ];
  for (const subject of accepted) {
    if (!isReleaseHistorySubject(subject)) {
      console.error(`Expected release-history subject to be accepted: ${subject}`);
      process.exit(1);
    }
  }
  for (const subject of rejected) {
    if (isReleaseHistorySubject(subject)) {
      console.error(`Expected non-release subject to be rejected: ${subject}`);
      process.exit(1);
    }
  }
  console.log('Staging release-history classifier self-test passed.');
}

async function main() {
  if (process.argv.includes('--self-test')) {
    selfTest();
    return;
  }
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const subjects = Buffer.concat(chunks).toString('utf8')
    .split(/\r?\n/)
    .map(subject => subject.trim())
    .filter(Boolean);
  if (subjects.length === 0) {
    console.error('Staging release history is empty.');
    process.exit(1);
  }
  const invalid = subjects.filter(subject => !isReleaseHistorySubject(subject));
  if (invalid.length) {
    for (const subject of invalid) {
      console.error(`Staging contains non-release-only history that cannot be superseded automatically: ${subject}`);
    }
    process.exit(1);
  }
  console.log(`Validated ${subjects.length} staging release-history commit subject(s).`);
}

await main();
