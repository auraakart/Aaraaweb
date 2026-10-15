import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTestAndroidSignerReport as parse} from './v5-test-apksigner-report.mjs';
const digest='a'.repeat(64);
const prefix='Verifies\nVerified using v1 scheme (JAR signing): false\n'+
 'Verified using v2 scheme (APK Signature Scheme v2): true\n'+
 'Number of signers: 1\n';
const modern=prefix+'V2 Signer: certificate SHA-256 digest: '+digest+'\n';
const old=prefix+'Signer #1 certificate SHA-256 digest: '+digest+'\n';
test('Build Tools 37 V2 Signer report is accepted with no partner authority',()=>{
 const x=parse(modern);
 assert.equal(x.certificateSha256,digest);
 assert.equal(x.signerCount,1);
 assert.equal(x.partnerSignerApproved,false);
 assert.equal(x.runnerAttested,false);
});
test('Older Signer #1 report remains accepted',()=>assert.equal(parse(old).certificateSha256,digest));
for(const [name,value] of [
 ['missing certificate',prefix],
 ['wrong digest length',modern.replace(digest,'a'.repeat(63))],
 ['non-hex certificate',modern.replace(digest,'g'.repeat(64))],
 ['second digest',modern+modern.split('\n').at(-2)+'\n'],
 ['ambiguous two output formats',modern+'Signer #1 certificate SHA-256 digest: '+digest+'\n'],
 ['multiple signers',modern.replace('Number of signers: 1','Number of signers: 2')],
 ['v2 not verified',modern.replace('v2): true','v2): false')],
 ['signature diagnostics',modern+'Warning: unsafe report\n'],
 ['invalid empty',null]
])test('Reject '+name,()=>assert.throws(()=>parse(value)));
