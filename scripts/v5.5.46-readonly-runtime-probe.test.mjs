import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,chmodSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {validateReadOnlyTestRuntimeProbePlan as validate,
 loadReadOnlyTestRuntimeProbeInputs as load}
 from './v5.5.46-readonly-runtime-probe-policy.mjs';

const SHA='a'.repeat(40),DIGEST='sha256:'+'b'.repeat(64);
const ENDPOINT='https://test-runner.example.invalid/v1/test-runner/runtime-evidence';
const env={NODE_ENV:'test',
 AARAAGATE_V5_TEST_RUNTIME_PROBE_CONFIRM:'I_APPROVE_READ_ONLY_TEST_RUNTIME_PROBE',
 AARAAGATE_V5_APPROVED_TEST_RUNTIME_ENDPOINT:ENDPOINT,
 AARAAGATE_V5_APPROVED_TEST_SOURCE_SHA:SHA,
 AARAAGATE_V5_APPROVED_TEST_IMAGE_DIGEST:DIGEST};
const entries=['imageEnvelopeFile','imagePolicyFile','runtimePolicyFile','transportPinsFile',
 'caCertificateFile','clientCertificateFile','clientPrivateKeyFile'];
const root=resolve('.');
const setup=()=>{
 const dir=mkdtempSync(join(tmpdir(),'aaraagate-v5546-readonly-'));
 const plan={schemaVersion:1,environment:'TEST',purpose:'READ_ONLY_RUNTIME_CLAIM_PROBE'};
 for(const field of entries){
  const path=join(dir,field+'.txt');plan[field]=path;
  let body='{"fixture":true}';
  if(field==='imagePolicyFile')body=JSON.stringify({sourceSha:SHA,imageDigest:DIGEST});
  if(field==='transportPinsFile')body=JSON.stringify({
   endpoint:ENDPOINT,serverName:'test-runner.example.invalid',
   serverSpkiSha256:'c'.repeat(64),clientSpkiSha256:'d'.repeat(64)});
  if(field.endsWith('CertificateFile')||field==='clientPrivateKeyFile')
   body='-----BEGIN TEST MATERIAL-----\n'+'X'.repeat(200)+'\n-----END TEST MATERIAL-----';
  writeFileSync(path,body,{mode:0o600});
 }
 return {dir,plan};
};
test('V5.5.46 allows only explicit TEST read-only probe input outside source',t=>{
 const {dir,plan}=setup();t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const files=validate(plan,env,root);
 assert.ok(Object.isFrozen(files));
 const inputs=load(files,env);
 assert.equal(inputs.imagePolicy.sourceSha,SHA);
 assert.equal(inputs.transportPolicy.endpoint,ENDPOINT);
 assert.ok(inputs.transportPolicy.clientKeyPem.includes('BEGIN TEST MATERIAL'));
 assert.equal('dispatchAllowed' in inputs,false);
 assert.equal('buildExecutionAuthorized' in inputs,false);
});
for(const [name,mutate] of [
 ['unapproved invocation',(p,e)=>{e.AARAAGATE_V5_TEST_RUNTIME_PROBE_CONFIRM='NO';}],
 ['production mode',(p,e)=>{e.NODE_ENV='production';}],
 ['different source',(p,e)=>{e.AARAAGATE_V5_APPROVED_TEST_SOURCE_SHA='0'.repeat(40);}],
 ['different image',(p,e)=>{e.AARAAGATE_V5_APPROVED_TEST_IMAGE_DIGEST='sha256:'+'0'.repeat(64);}],
 ['unexpected authority field',p=>{p.dispatchAllowed=true;}],
 ['non-TEST environment',p=>{p.environment='PROD';}],
 ['wrong probe purpose',p=>{p.purpose='BUILD_TEST_APK';}],
 ['relative private key',p=>{p.clientPrivateKeyFile='./creds/key.pem';}],
 ['relative source policy',p=>{p.imagePolicyFile='./source.json';}],
 ['reused key/policy files',p=>{p.clientPrivateKeyFile=p.imagePolicyFile;}],
 ['repo-local PEM',p=>{p.clientPrivateKeyFile=join(root,'package.json');}],
])test('V5.5.46 rejects '+name,t=>{
 const {dir,plan}=setup();t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const e={...env};mutate(plan,e);
 // Source/image pins are compared against the operator files at loading,
 // while intent/path checks fail at invocation validation.
 const attempt=()=>load(validate(plan,e,root),e);
 assert.throws(attempt,/policy rejected/);
});
test('V5.5.46 rejects symlinked signing key',t=>{
 const {dir,plan}=setup();t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const link=join(dir,'alias.pem');symlinkSync(plan.clientPrivateKeyFile,link);
 plan.clientPrivateKeyFile=link;
 assert.throws(()=>validate(plan,env,root),/policy rejected/);
});
test('V5.5.46 rejects group/world-readable client key',t=>{
 const {dir,plan}=setup();t.after(()=>rmSync(dir,{recursive:true,force:true}));
 chmodSync(plan.clientPrivateKeyFile,0o644);
 assert.throws(()=>validate(plan,env,root),/policy rejected/);
});
for(const [name,mutate] of [
 ['endpoint substitution',p=>{p.endpoint='https://other.example.invalid/v1/test-runner/runtime-evidence';}],
 ['added execution flag',p=>{p.buildExecutionAuthorized=true;}],
 ['wrong pin set',p=>{delete p.clientSpkiSha256;}],
])test('V5.5.46 denies '+name+' in transport policy',t=>{
 const {dir,plan}=setup();t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const p=JSON.parse('{"endpoint":"'+ENDPOINT+'","serverName":"test-runner.example.invalid","serverSpkiSha256":"'+ 'c'.repeat(64)+'","clientSpkiSha256":"'+ 'd'.repeat(64)+'"}');
 mutate(p);writeFileSync(plan.transportPinsFile,JSON.stringify(p),{mode:0o600});
 assert.throws(()=>load(validate(plan,env,root),env),/policy rejected/);
});
