import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Narrow checks for known Prisma/PostgreSQL mismatches reproduced by real DB
// tests. This is a source guard, not a substitute for database execution.
export function parameterContractFindings(source) {
  const findings = [];
  const intervals = /\b(?:years|months|weeks|days|hours|mins)\s*=>\s*\$\{[^}]*\}\s*(?!\s*::\s*(?:int(?:eger|4)?|smallint)\b)/g;
  // Avoid backtracking whitespace into a false positive before an existing cast.
  for (const match of source.matchAll(intervals)) {
    const tail = source.slice(match.index + match[0].trimEnd().length);
    if (!/^\s*::\s*(?:int(?:eger|4)?|smallint)\b/.test(tail)) {
      findings.push({ index: match.index, message: 'Cast interpolated integer make_interval arguments explicitly to int.' });
    }
  }
  // Fixed due-work discovery capabilities take PostgreSQL integer limits;
  // Prisma sends JS numbers as bigint unless SQL explicitly narrows them.
  const dueLimits = /\baaraagate_due_\w+\s*\(\s*\$\{[^}]+\}/g;
  for (const match of source.matchAll(dueLimits)) {
    if (!/^\s*::\s*(?:int(?:eger|4)?)\b/.test(source.slice(match.index + match[0].length))) {
      findings.push({ index: match.index, message: 'Cast due-work capability limits explicitly to integer.' });
    }
  }
  const locks = /\$queryRaw(?:\s*<[^`]*>)?\s*(?:\([^`]*?)?`\s*SELECT\s+pg_advisory_xact_lock\s*\(/g;
  for (const match of source.matchAll(locks)) {
    // Match the function's closing parenthesis, including multiline/two-key
    // calls. Stopping at an inner hash function misses the result's cast.
    let end = match.index + match[0].length;
    let depth = 1;
    while (end < source.length && depth) {
      if (source[end] === '(') depth++;
      if (source[end] === ')') depth--;
      end++;
    }
    if (depth || !/^\s*::\s*text\b/.test(source.slice(end))) {
      findings.push({ index: match.index, message: 'Cast advisory-lock void results to text for Prisma $queryRaw, or use $executeRaw.' });
    }
  }
  return findings;
}

function scan(directory) {
  let count = 0;
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = `${directory}/${item.name}`;
    if (item.isDirectory()) count += scan(path);
    else if (item.name.endsWith('.ts') && !item.name.endsWith('.spec.ts')) {
      const source = readFileSync(path, 'utf8');
      for (const finding of parameterContractFindings(source)) {
        const line = source.slice(0, finding.index).split('\n').length;
        console.error(`${path}:${line}: ${finding.message}`);
        count++;
      }
    }
  }
  return count;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (scan('services/api/src')) process.exitCode = 1;
  else console.log('PostgreSQL parameter contracts passed (runtime TypeScript inventory).');
}
