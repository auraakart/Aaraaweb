import {createReadOnlyTestRuntimeAuditReceipt}
 from './v5.5.48-readonly-runtime-audit-receipt.mjs';
import {realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {probePinnedTestOciRuntimeEvidence}
 from '../packages/config/src/android-test-oci-runtime-transport.mjs';
import {readReadOnlyTestRuntimeProbePlan,validateReadOnlyTestRuntimeProbePlan,loadReadOnlyTestRuntimeProbeInputs}
 from './v5.5.46-readonly-runtime-probe-policy.mjs';

// An operator-initiated read-only TEST mTLS probe; intentionally never a CI
// acceptance or a build/dispatch entrypoint. No raw credential or claim output.
try{
 if(process.argv.length!==3)throw Error('invalid arguments');
 const root=realpathSync(fileURLToPath(new URL('..',import.meta.url)));
 // No file reads before explicit TEST operator intent is established.
 if(process.env.NODE_ENV!=='test' ||
    process.env.AARAAGATE_V5_TEST_RUNTIME_PROBE_CONFIRM!=='I_APPROVE_READ_ONLY_TEST_RUNTIME_PROBE')
   throw Error('missing operator approval');
 const plan=readReadOnlyTestRuntimeProbePlan(process.argv[2],root);
 const files=validateReadOnlyTestRuntimeProbePlan(plan,process.env,root);
 const inputs=loadReadOnlyTestRuntimeProbeInputs(files,process.env);
 const receipt=await probePinnedTestOciRuntimeEvidence(
  inputs.imageEnvelope,inputs.imagePolicy,
  inputs.runtimePolicy,inputs.transportPolicy);
 // Exact source, image and TLS certificate pins are held by the operator.
 // This is an UNSIGNED locally verified claim receipt, NOT runtime attestation.
 const audit=createReadOnlyTestRuntimeAuditReceipt(receipt,{
  sourceSha:process.env.AARAAGATE_V5_APPROVED_TEST_SOURCE_SHA,
  imageDigest:process.env.AARAAGATE_V5_APPROVED_TEST_IMAGE_DIGEST,
  serverSpkiSha256:inputs.transportPolicy.serverSpkiSha256,
 });
 process.stdout.write(JSON.stringify(audit,null,2)+'\n');
}catch{
 // Avoid leaking operator-provided paths, TLS key material or claim payloads.
 process.stderr.write('TEST read-only runtime probe failed closed. Review private operator configuration.\n');
 process.exitCode=1;
}
