import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function validatePromotion({ repository, stagingSha, stagingTree, pr, candidateTree, runs, jobsByRun }) {
  if (!pr.merged_at || pr.merge_commit_sha !== stagingSha || pr.base?.ref !== 'staging'
      || pr.head?.repo?.full_name !== repository
      || !(pr.head.ref === 'develop' || /^release\/.+-staging-candidate$/.test(pr.head.ref))) {
    throw new Error('Current staging must be the merged protected staging promotion.');
  }
  if (candidateTree !== stagingTree) throw new Error('Staging differs from the tested candidate tree.');
  const required = [
    ['Staging smoke', '.github/workflows/staging-smoke.yml', 'Staging API smoke'],
    ['Backup restore smoke', '.github/workflows/backup-restore-smoke.yml', 'PostgreSQL backup restore drill'],
  ];
  const evidence = [];
  for (const [name, path, jobName] of required) {
    const run = runs.filter(item => item.name === name && item.path === path
      && item.head_sha === pr.head.sha && item.event === 'pull_request')
      .sort((a, b) => b.id - a.id)[0];
    if (!run || run.status !== 'completed' || run.conclusion !== 'success') {
      throw new Error(`${name} must finish successfully on the exact candidate before opening main.`);
    }
    const job = (jobsByRun[run.id] ?? []).filter(item => item.name === jobName)
      .sort((a, b) => b.id - a.id)[0];
    if (!job || job.status !== 'completed' || job.conclusion !== 'success') {
      throw new Error(`${jobName} has no successful exact-candidate evidence.`);
    }
    evidence.push(run.id);
  }
  return evidence;
}

export function checkRemotePromotion(repository, expectedSha, api) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !/^[a-f0-9]{40}$/.test(expectedSha)) {
    throw new Error('Repository and exact staging commit are required.');
  }
  const prefix = `/repos/${repository}`;
  const current = api(`${prefix}/git/ref/heads/staging`).object.sha;
  if (current !== expectedSha) throw new Error('Staging moved; re-read the release baseline.');
  const stagingTree = api(`${prefix}/git/commits/${current}`).tree.sha;
  const pr = api(`${prefix}/pulls?state=closed&base=staging&sort=updated&direction=desc&per_page=100`)
    .find(item => item.merged_at && item.merge_commit_sha === current);
  if (!pr) throw new Error('No protected promotion matches the current staging head.');
  const candidateTree = api(`${prefix}/git/commits/${pr.head.sha}`).tree.sha;
  const runs = api(`${prefix}/actions/runs?head_sha=${pr.head.sha}&event=pull_request&per_page=100`).workflow_runs;
  const jobsByRun = {};
  for (const name of ['Staging smoke', 'Backup restore smoke']) {
    const run = runs.filter(item => item.name === name).sort((a, b) => b.id - a.id)[0];
    if (run) jobsByRun[run.id] = api(`${prefix}/actions/runs/${run.id}/jobs?per_page=100`).jobs;
  }
  const evidence = validatePromotion({ repository, stagingSha: current, stagingTree, pr, candidateTree, runs, jobsByRun });
  if (api(`${prefix}/git/ref/heads/staging`).object.sha !== expectedSha) {
    throw new Error('Staging moved while evidence was being verified.');
  }
  return evidence;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const evidence = checkRemotePromotion(process.argv[2], process.argv[3], endpoint =>
      JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })));
    console.log(`Exact staging promotion verified; smoke runs: ${evidence.join(', ')}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
