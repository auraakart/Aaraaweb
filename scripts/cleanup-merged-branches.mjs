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

const canonical = new Set(['main', 'staging', 'develop']);
const preservePattern = /(^|\/)(backup|recovery|archive|snapshot)(\/|[-_.]|$)|(^|[-_.])(backup|recovery|archive|snapshot)([-_.]|$)/i;

const branches = await paginate(`/repos/${owner}/${repo}/branches`);
const openPulls = await paginate(`/repos/${owner}/${repo}/pulls?state=open`);
const closedPulls = await paginate(`/repos/${owner}/${repo}/pulls?state=closed`);
const openHeads = new Set(openPulls.map((pr) => pr.head?.ref).filter(Boolean));
const mergedDevelopHeadShas = new Map();
for (const pr of closedPulls) {
  if (!pr.merged_at || pr.base?.ref !== baseBranch || !pr.head?.ref || !pr.head?.sha) continue;
  if (!mergedDevelopHeadShas.has(pr.head.ref)) mergedDevelopHeadShas.set(pr.head.ref, new Set());
  mergedDevelopHeadShas.get(pr.head.ref).add(pr.head.sha);
}
const base = branches.find((branch) => branch.name === baseBranch);
if (!base) throw new Error(`Base branch ${baseBranch} was not found`);
const developSha = base.commit.sha;

const records = [];
let index = 0;
const concurrency = 6;

async function classify(branch) {
  const name = branch.name;
  const record = {
    branch: name,
    sha: branch.commit.sha,
    protected: Boolean(branch.protected),
    decision: 'review',
    reason: null,
    compare: null,
    deleted: false
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
  if (preservePattern.test(name)) {
    record.decision = 'keep';
    record.reason = 'backup/recovery/archive/snapshot preservation rule';
    return record;
  }

  const compare = await request(`/repos/${owner}/${repo}/compare/${branch.commit.sha}...${developSha}`);
  record.compare = {
    status: compare.status,
    ahead_by: compare.ahead_by,
    behind_by: compare.behind_by,
    total_commits: compare.total_commits
  };

  const fullyContained = (compare.status === 'ahead' || compare.status === 'identical') && compare.behind_by === 0;
  const exactMergedHead = mergedDevelopHeadShas.get(name)?.has(branch.commit.sha) === true;
  if (!fullyContained && !exactMergedHead) {
    record.decision = 'review';
    record.reason = 'branch contains commits not proven contained in develop and current head does not exactly match a merged develop PR';
    return record;
  }

  record.decision = dryRun ? 'delete-dry-run' : 'delete';
  record.reason = fullyContained
    ? 'branch head is fully contained in develop'
    : 'current branch head exactly matches a pull request head already merged into develop';

  if (!dryRun) {
    const ref = name.split('/').map(encodeURIComponent).join('/');
    await request(`/repos/${owner}/${repo}/git/refs/heads/${ref}`, { method: 'DELETE' });
    record.deleted = true;
  }
  return record;
}

async function worker() {
  while (true) {
    const current = index++;
    if (current >= branches.length) return;
    records[current] = await classify(branches[current]);
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));

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
  generatedAt: new Date().toISOString(),
  counts,
  records
}, null, 2));

const deleted = records.filter((r) => r.deleted);
const review = records.filter((r) => r.decision === 'review');
const kept = records.filter((r) => r.decision === 'keep');
const planned = records.filter((r) => r.decision === 'delete-dry-run');

const md = [
  '# Aaraagate branch hygiene evidence',
  '',
  `- Repository: ${repository}`,
  `- Base branch: ${baseBranch}`,
  `- Base SHA: ${developSha}`,
  `- Mode: ${dryRun ? 'dry run' : 'delete'}`,
  `- Total branches inspected: ${records.length}`,
  `- Deleted: ${deleted.length}`,
  `- Planned deletions: ${planned.length}`,
  `- Kept automatically: ${kept.length}`,
  `- Needs review: ${review.length}`,
  '',
  '## Needs review',
  '',
  ...review.map((r) => `- \`${r.branch}\` — ${r.reason}; compare=${JSON.stringify(r.compare)}`),
  '',
  '## Deleted / planned',
  '',
  ...(deleted.length ? deleted : planned).map((r) => `- \`${r.branch}\``),
  ''
].join('\n');

await writeFile('branch-hygiene-evidence/branch-cleanup.md', md);
console.log(JSON.stringify({ dryRun, total: records.length, counts }, null, 2));
