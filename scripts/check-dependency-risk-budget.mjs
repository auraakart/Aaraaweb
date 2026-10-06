import { spawnSync } from 'node:child_process';

const result = spawnSync('pnpm', ['audit', '--json'], { encoding: 'utf8' });
const raw = (result.stdout || '').trim();
if (!raw) {
  console.error(result.stderr || 'pnpm audit returned no JSON output');
  process.exit(1);
}

let report;
try {
  report = JSON.parse(raw);
} catch (error) {
  console.error('Unable to parse pnpm audit JSON:', error);
  console.error(raw.slice(0, 4000));
  process.exit(1);
}

const counts = report?.metadata?.vulnerabilities ?? {};
const moderate = Number(counts.moderate ?? 0);
const high = Number(counts.high ?? 0);
const critical = Number(counts.critical ?? 0);

const advisoryRows = [];
if (report?.advisories && typeof report.advisories === 'object') {
  for (const advisory of Object.values(report.advisories)) {
    if (!advisory || typeof advisory !== 'object') continue;
    advisoryRows.push({
      module: advisory.module_name ?? advisory.moduleName ?? 'unknown',
      severity: advisory.severity ?? 'unknown',
      title: advisory.title ?? advisory.github_advisory_id ?? advisory.id ?? 'advisory',
      patchedVersions: advisory.patched_versions ?? advisory.patchedVersions ?? null,
    });
  }
}
if (report?.vulnerabilities && typeof report.vulnerabilities === 'object' && !Array.isArray(report.vulnerabilities)) {
  for (const [module, vulnerability] of Object.entries(report.vulnerabilities)) {
    if (!vulnerability || typeof vulnerability !== 'object') continue;
    advisoryRows.push({
      module,
      severity: vulnerability.severity ?? 'unknown',
      title: vulnerability.title ?? vulnerability.via?.[0]?.title ?? 'vulnerability',
      patchedVersions: vulnerability.fixAvailable ?? null,
    });
  }
}

console.log(JSON.stringify({
  vulnerabilityCounts: counts,
  findings: advisoryRows
    .filter((row, index, all) => all.findIndex((candidate) => candidate.module === row.module && candidate.title === row.title) === index)
    .sort((a, b) => String(a.severity).localeCompare(String(b.severity)) || a.module.localeCompare(b.module)),
}, null, 2));

if (critical > 0 || high > 0) {
  console.error('High/critical dependency vulnerabilities are not allowed.');
  process.exit(1);
}
if (moderate > 5) {
  console.error(`Moderate vulnerability budget exceeded: ${moderate} > 5. Resolve or explicitly rebaseline before merge.`);
  process.exit(1);
}
console.log(`Dependency risk budget: PASS (moderate=${moderate}, high=${high}, critical=${critical})`);
