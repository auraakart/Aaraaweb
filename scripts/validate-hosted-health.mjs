import { readFileSync } from 'node:fs'

const [livePath, readyPath, expectedSha] = process.argv.slice(2)

if (!livePath || !readyPath || !/^[0-9a-f]{40}$/.test(expectedSha ?? '')) {
  console.error('Usage: validate-hosted-health.mjs <liveness.json> <readiness.json> <full-lowercase-sha>')
  process.exit(2)
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`${label} response is not valid JSON: ${error.message}`)
  }
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message)
}

try {
  const live = readJson(livePath, 'Liveness')
  const ready = readJson(readyPath, 'Readiness')

  for (const [name, health, status] of [['liveness', live, 'ok'], ['readiness', ready, 'ready']]) {
    requireValue(health.status === status, `${name} status is not ${status}`)
    requireValue(health.service === 'aaraagate-api', `${name} service identity is invalid`)
    requireValue(health.environment === 'production', `${name} environment is not production`)
    requireValue(health.commit === expectedSha, `${name} commit does not match the staging candidate`)
    requireValue(typeof health.version === 'string' && !['', 'dev', 'unknown'].includes(health.version), `${name} version is invalid`)
  }
  requireValue(ready.dependencies?.database === 'ok', 'PostgreSQL readiness is not healthy')
  requireValue(ready.dependencies?.authState === 'redis-ok', 'Redis/auth-state readiness is not healthy')
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
