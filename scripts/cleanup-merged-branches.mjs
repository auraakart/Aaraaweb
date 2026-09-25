import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const baseBranch = process.env.CLEANUP_BASE || 'develop';
const dryRun = String(process.env.DRY_RUN || 'true').toLowerCase() !== 'false';

if (!token || !repository) throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required');

const [owner, repo] = repository.split('/');
const api = 'https://api.github.com';
const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'aaraagate-branch-hygiene'
};

async function request(path, options = {}) {
  const response = await fetch(`${api}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${options.method || 'GET'} ${path} -> ${response.status}: ${body}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function paginate(path) {
  const items = [];
  for (let page = 1; ; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const batch = await request(`${path}${separator}per_page=100&page=${page}`);
    items.push(...batch);
    if (batch.length < 100) return items;
  }
}

function isAncestor(ancestorSha, targetBranch) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestorSha, `refs/remotes/origin/${targetBranch}`], {
      stdio: 'ignore'
    });
    return true;
  } catch (error) {
    if (error?.status === 1) return false;
    throw error;
  }
}

function isTreeEquivalent(branchName, targetBranch) {
  try {
    execFileSync(
      'git',
      ['diff', '--quiet', `refs/remotes/origin/${branchName}`, `refs/remotes/origin/${targetBranch}`, '--', '.'],
      { stdio: 'ignore' },
    );
    return true;
  } catch (error) {
    if (error?.status === 1) return false;
    throw error;
  }
}

const canonical = new Set(['main', 'staging', 'develop']);
const preservePattern = /(^|\/)(backup|recovery|archive|snapshot)(\/|[-_.]|$)|(^|[-_.])(backup|recovery|archive|snapshot)([-_.]|$)/i;
const retentionPath = '.github/branch-retention.json';
const retentionManifest = fs.existsSync(retentionPath)
  ? JSON.parse(fs.readFileSync(retentionPath, 'utf8'))
  : { branches: [] };
const retainedByName = new Map(
  (retentionManifest.branches || []).map((entry) => [entry.name, entry]),
);

const branches = await paginate(`/repos/${owner}/${repo}/branches`);
const openPulls = await paginate(`/repos/${owner}/${repo}/pulls?state=open`);
const closedPulls = await paginate(`/repos/${owner}/${repo}/pulls?state=closed`);
const openHeads = new Set(openPulls.map((pr) => pr.head?.ref).filter(Boolean));
const mergedCanonicalHeadShas = new Map();
const supersededCanonicalHeadShas = new Map();

for (const pr of closedPulls) {
  if (!canonical.has(pr.base?.ref) || !pr.head?.ref || !pr.head?.sha) continue;

  if (pr.merged_at) {
    if (!mergedCanonicalHeadShas.has(pr.head.ref)) mergedCanonicalHeadShas.set(pr.head.ref, new Set());
    mergedCanonicalHeadShas.get(pr.head.ref).add(pr.head.sha);
  }

  const supersededEvidence = /\bsuperseded\b/i.test(`${pr.title || ''}\n${pr.body || ''}`);
  if (supersededEvidence) {
    if (!supersededCanonicalHeadShas.has(pr.head.ref)) supersededCanonicalHeadShas.set(pr.head.ref, new Set());
    supersededCanonicalHeadShas.get(pr.head.ref).add(pr.head.sha);
  }
}

const canonicalTargets = new Map();
for (const name of canonical) {
  const target = branches.find((branch) => branch.name === name);
  if (!target) throw new Error(`Canonical branch ${name} was not found`);
  canonicalTargets.set(name, target.commit.sha);
}
const developSha = canonicalTargets.get(baseBranch);

const records = [];
let index = 0;
const deleteConcurrency = 8;

async function classify(branch) {
  const name = branch.name;
  const record = {
    branch: name,
    sha: branch.commit.sha,
    protected: Boolean(branch.protected),
    decision: 'review',
    reason: null,
    ancestry: {},
    treeEquivalent: {},
    deleted: false,
    alreadyAbsent: false
  };

  if (canonical.has(name)) {
    record.decision = 'keep';
    record.reason = 'canonical release branch';
    return record;
  }
  if (branch.protected) {
    record.decision = 'keep';
    record.reason = 'GitHub protected branch';
    return record;
  }
  if (openHeads.has(name)) {
    record.decision = 'keep';
    record.reason = 'head of an open pull request';
    return record;
  }

  const retained = retainedByName.get(name);
  if (retained) {
    if (retained.sha === branch.commit.sha) {
      record.decision = 'keep';
      record.reason = `explicit V4.55.1 retention at reviewed SHA: ${retained.reason}`;
      return record;
    }
    record.decision = 'review';
    record.reason = `retained branch moved from reviewed SHA ${retained.sha}; current SHA requires fresh review`;
    return record;
  }

  if (preservePattern.test(name)) {
    record.decision = 'keep';
    record.reason = 'backup/recovery/archive/snapshot preservation rule';
    return record;
  }

  let containedIn = null;
  let treeEquivalentTo = null;
  for (const targetName of canonical) {
    const contained = isAncestor(branch.commit.sha, targetName);
    const sameTree = isTreeEquivalent(name, targetName);
    record.ancestry[targetName] = contained;
    record.treeEquivalent[targetName] = sameTree;
    if (!containedIn && contained) containedIn = targetName;
    if (!treeEquivalentTo && sameTree) treeEquivalentTo = targetName;
  }

  const exactMergedHead = mergedCanonicalHeadShas.get(name)?.has(branch.commit.sha) === true;
  const exactSupersededHead = supersededCanonicalHeadShas.get(name)?.has(branch.commit.sha) === true;
  if (!containedIn && !treeEquivalentTo && !exactMergedHead && !exactSupersededHead) {
    record.decision = 'review';
    record.reason = 'branch contains source not proven integrated by ancestry/tree equivalence and current head does not exactly match a merged or explicitly superseded canonical pull request head';
    return record;
  }

  record.decision = dryRun ? 'delete-dry-run' : 'delete';
  record.reason = containedIn
    ? `branch head is fully contained in ${containedIn}`
    : treeEquivalentTo
      ? `source tree is identical to ${treeEquivalentTo}`
      : exactMergedHead
        ? 'current branch head exactly matches a pull request head already merged into a canonical branch'
        : 'current branch head exactly matches a closed canonical pull request explicitly marked superseded';
  return record;
}

for (const branch of branches) {
  records.push(await classify(branch));
}

async function deleteBranchRef(record) {
  const ref = record.branch.split('/').map(encodeURIComponent).join('/');
  const path = `/repos/${owner}/${repo}/git/refs/heads/${ref}`;
  const response = await fetch(`${api}${path}`, { method: 'DELETE', headers });

  if (response.ok) {
    record.deleted = true;
    return;
  }

  const body = await response.text();
  const alreadyAbsent = response.status === 404
    || (response.status === 422 && /reference does not exist/i.test(body));

  if (alreadyAbsent) {
    record.alreadyAbsent = true;
    record.reason = `${record.reason}; ref already absent when cleanup ran`;
    return;
  }

  throw new Error(`DELETE ${path} -> ${response.status}: ${body}`);
}

async function deleteWorker(deleteQueue) {
  while (true) {
    const current = index++;
    if (current >= deleteQueue.length) return;
    await deleteBranchRef(deleteQueue[current]);
  }
}

const deleteQueue = dryRun ? [] : records.filter((record) => record.decision === 'delete');
if (deleteQueue.length) {
  index = 0;
  await Promise.all(Array.from({ length: deleteConcurrency }, () => deleteWorker(deleteQueue)));
}

const counts = records.reduce((acc, record) => {
  acc[record.decision] = (acc[record.decision] || 0) + 1;
  return acc;
}, {});

await mkdir('branch-hygiene-evidence', { recursive: true });
await writeFile('branch-hygiene-evidence/branch-cleanup.json', JSON.stringify({
  repository,
  baseBranch,
  developSha,
  dryRun,
  classificationMode: 'explicit-retention+local-git-ancestry+tree-equivalence+canonical-pr-head-evidence',
  retentionManifest: retentionPath,
  generatedAt: new Date().toISOString(),
  counts,
  records
}, null, 2));

const deleted = records.filter((r) => r.deleted);
const alreadyAbsent = records.filter((r) => r.alreadyAbsent);
const review = records.filter((r) => r.decision === 'review');
const kept = records.filter((r) => r.decision === 'keep');
const planned = records.filter((r) => r.decision === 'delete-dry-run');

const md = [
  '# Aaraagate branch hygiene evidence',
  '',
  `- Repository: ${repository}`,
  `- Base branch: ${baseBranch}`,
  `- Base SHA: ${developSha}`,
  `- Classification: exact-SHA retention + local git ancestry + exact source-tree equivalence + canonical PR head evidence`,
  `- Mode: ${dryRun ? 'dry run' : 'delete'}`,
  `- Total branches inspected: ${records.length}`,
  `- Deleted: ${deleted.length}`,
  `- Already absent at delete time: ${alreadyAbsent.length}`,
  `- Planned deletions: ${planned.length}`,
  `- Kept automatically: ${kept.length}`,
  `- Explicitly retained legacy branches: ${records.filter((r) => r.reason?.startsWith('explicit V4.55.1 retention')).length}`,
  `- Needs review: ${review.length}`,
  '',
  '## Needs review',
  '',
  ...review.map((r) => `- \`${r.branch}\` — ${r.reason}; ancestry=${JSON.stringify(r.ancestry)}; treeEquivalent=${JSON.stringify(r.treeEquivalent)}`),
  '',
  '## Deleted / already absent / planned',
  '',
  ...(deleted.length || alreadyAbsent.length ? [...deleted, ...alreadyAbsent] : planned).map((r) => `- \`${r.branch}\`${r.alreadyAbsent ? ' — already absent' : ''}`),
  ''
].join('\n');

await writeFile('branch-hygiene-evidence/branch-cleanup.md', md);
console.log(JSON.stringify({ dryRun, total: records.length, counts, deleted: deleted.length, alreadyAbsent: alreadyAbsent.length, classificationMode: 'explicit-retention+local-git-ancestry+tree-equivalence+canonical-pr-head-evidence' }, null, 2));
