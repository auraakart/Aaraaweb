import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBaseTestAabSignerReports} from './v5-test-aab-signer-report.mjs';
const fp='aa:'.repeat(31)+'aa';
const cert='Signer #1:\n\nCertificate #1:\nOwner: CN=Test\nIssuer: CN=Test\n'+
 'Certificate fingerprints:\n SHA256: '+fp+'\nSignature algorithm name: SHA256withRSA\n'+
 'Subject Public Key Algorithm: 2048-bit RSA\n';
const report=[
'sm     50 Tue Oct 13 00:00:00 UTC 2026 BundleConfig.pb',
'sm     50 Tue Oct 13 00:00:00 UTC 2026 base/manifest/AndroidManifest.xml',
'sm     50 Tue Oct 13 00:00:00 UTC 2026 base/dex/classes.dex',
'  s = signature was verified',
'  m = entry is listed in manifest',
'jar verified.'
].join('\n')+'\n';
test('real base debug AAB report never provides partner or runner authority',()=>{
 const r=parseBaseTestAabSignerReports(report,cert);
 assert.equal(r.locallyVerifiedJarSignature,true);
 assert.equal(r.observedLeafSha256,'a'.repeat(64));
 assert.equal(r.partnerSignerPinned,false);
 assert.equal(r.dispatchAllowed,false);
});
for(const [label,r,c] of [
 ['unsigned member',report.replace('sm     50','       50'),cert],
 ['unsigned warning',report+'This jar contains unsigned entries which have not been integrity-checked.\n',cert],
 ['unsigned jar',report.replace('jar verified.','jar is unsigned.'),cert],
 ['second signer',report,cert+'Signer #2:\n'],
 ['duplicate certificate fingerprint',report,cert+' SHA256: '+fp+'\n'],
 ['signing error',report+'Error: invalid signature\n',cert]
])test('reject '+label,()=>assert.throws(()=>parseBaseTestAabSignerReports(r,c)));
