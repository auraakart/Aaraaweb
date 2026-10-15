import fs from 'node:fs'
import assert from 'node:assert/strict'
const src=fs.readFileSync(new URL('../app/facilities/inventory/page.tsx',import.meta.url),'utf8')
assert.doesNotMatch(src,/\bprompt\s*\(/,'Facilities inventory must not regress to browser prompt() flows')
assert.match(src,/submitMovement/,'Typed stock movement submit flow must remain present')
assert.match(src,/movementType/,'Movement type must be controlled state')
assert.match(src,/Work order ID \(optional\)/,'Outbound movement keeps work-order linkage')
assert.match(src,/Stock cannot be reduced below zero/,'Operator sees stock-integrity guidance')
console.log('V4.16 facilities operator regression passed')
