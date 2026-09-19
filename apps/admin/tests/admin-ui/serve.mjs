import { context } from 'esbuild'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = await mkdtemp(path.join(tmpdir(), 'aaraagate-admin-ui-'))
const entry = fileURLToPath(new URL('./fixture.tsx', import.meta.url))
await writeFile(path.join(directory, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Admin UI contract fixture</title><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>')
const build = await context({ entryPoints: [entry], bundle: true, outdir: directory, jsx: 'automatic', sourcemap: true })
await build.serve({ host: '127.0.0.1', port: 4318, servedir: directory })
async function stop() { await build.dispose(); await rm(directory, { recursive: true, force: true }); process.exit(0) }
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
