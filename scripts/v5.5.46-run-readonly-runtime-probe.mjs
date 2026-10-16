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
 // Fixed allowlist: signed TLS claim validation is NOT independent runtime
 // measurement, challenge consumption or approval to execute a build.
 process.stdout.write(JSON.stringify({
  schemaVersion:1,environment:'TEST',testOnly:true,
  sourceSha:receipt.sourceSha,imageDigest:receipt.imageDigest,
  workerId:receipt.workerId,runId:receipt.runId,
  tls13PinnedPeerVerified:receipt.tls13PinnedPeerVerified,
  freshTransportNonceSignatureVerified:receipt.freshTransportNonceSignatureVerified,
  independentRuntimeClaimSignaturesVerified:receipt.independentRuntimeClaimSignaturesVerified,
  runtimeImageAttested:false,remoteProcessMeasured:false,
  independentlyProvisionedWorkerVerified:false,
  singleUseChallengeConsumed:false,
  buildExecutionAuthorized:false,artifactProduced:false,dispatchAllowed:false,
 },null,2)+'\n');
}catch{
 // Avoid leaking operator-provided paths, TLS key material or claim payloads.
 process.stderr.write('TEST read-only runtime probe failed closed. Review private operator configuration.\n');
 process.exitCode=1;
}
