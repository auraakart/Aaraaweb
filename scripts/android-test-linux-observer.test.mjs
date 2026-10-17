import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readlink} from 'node:fs/promises';
import {evaluateTestLinuxObserverSnapshot,inspectLocalTestLinuxRunnerProcess}
 from '../packages/config/src/android-test-linux-observer.mjs';

const names=['flutterSdk','androidSdk','javaHome','nativeTemplate'];
const paths=['/opt/aaraagate-test/flutter','/opt/aaraagate-test/android',
 '/opt/aaraagate-test/java','/opt/aaraagate-test/template'];
function fixture(){
 const pid=7124;
 const mounts=Object.fromEntries(names.map((name,i)=>[name,{
  path:paths[i],root:'/',fsType:'squashfs',source:'/dev/loop'+i
 }]));
 const status=[
  'Name:\ttest worker',
  'Uid:\t10001\t10001\t10001\t10001',
  'Gid:\t10001\t10001\t10001\t10001',
  'CapInh:\t0000000000000000','CapPrm:\t0000000000000000',
  'CapEff:\t0000000000000000','CapBnd:\t0000000000000000',
  'CapAmb:\t0000000000000000','NoNewPrivs:\t1','Seccomp:\t2',
  'Seccomp_filters:\t1'
 ].join('\n')+'\n';
 const mountinfo=[
  '1 0 8:1 / / rw,relatime - ext4 /dev/root rw',
  ...names.map((name,i)=>String(110+i)+' 1 0:'+String(30+i)+
  ' / '+mounts[name].path+' ro,nosuid,nodev - squashfs /dev/loop'+i+' ro')
 ].join('\n')+'\n';
 const stat=(ticks='12003456')=>String(pid)+' (node (worker)) S '+
  Array.from({length:19},(_,i)=>i===18?ticks:'1').join(' ')+'\n';
 const ns='mnt:[4026532101]';
 const policy={pid,mountNamespaceId:ns,
  workerId:'TEST_WORKER_CI_42',runId:'TEST_RUN_CI_42',
  imageDigest:'sha256:'+'a'.repeat(64),mounts};
 const snapshot={pid,statBefore:stat(),statAfter:stat(),
  mountNamespaceBefore:ns,mountNamespaceAfter:ns,status,mountinfo};
 return {policy,snapshot,stat};
}
test('V5.5.42 verifies stable TARGET process and read-only SDK kernel snapshot without authority',()=>{
 const f=fixture(),r=evaluateTestLinuxObserverSnapshot(f.snapshot,f.policy);
 assert.equal(r.stableProcessIdentityPolicyMatched,true);
 assert.equal(r.mountNamespacePolicyMatched,true);
 assert.equal(r.kernelReadonlySdkMountFlagsObserved,true);
 assert.equal(r.kernelProcessConfinementPolicyMatched,true);
 assert.equal(r.processStartTicks,'12003456');
 for(const x of ['measuredKernelProcessSnapshot','independentHostOperatorVerified',
  'independentOciImageDigestVerified','runtimeImageAttested',
  'immutableMountVerified','singleUseChallengeConsumed',
  'buildExecutionAuthorized','artifactProduced','dispatchAllowed'])
  assert.equal(r[x],false,x);
 assert.ok(Object.isFrozen(r));
});
const bad=[
 ['foreign pid',f=>f.snapshot.pid=7125],
 ['namespace mismatch',f=>f.snapshot.mountNamespaceBefore='mnt:[4026532102]'],
 ['namespace changed mid-read',f=>f.snapshot.mountNamespaceAfter='mnt:[4026532102]'],
 ['PID reused mid-read',f=>f.snapshot.statAfter=f.stat('12003457')],
 ['stat claims foreign PID',f=>f.snapshot.statBefore=f.snapshot.statBefore.replace('7124','8888')],
 ['zombie target',f=>f.snapshot.statBefore=f.snapshot.statBefore.replace(') S ',') Z ')],
 ['missing stat starttime',f=>f.snapshot.statBefore='7124 (node) S 1 2 3'],
 ['root uid',f=>f.snapshot.status=f.snapshot.status.replace(/Uid:\t10001/g,'Uid:\t0')],
 ['GID shift',f=>f.snapshot.status=f.snapshot.status.replace('Gid:\t10001\t10001\t10001\t10001','Gid:\t10001\t10002\t10001\t10001')],
 ['process capabilities',f=>f.snapshot.status=f.snapshot.status.replace('CapEff:\t0000000000000000','CapEff:\t0000000000000001')],
 ['privileged process',f=>f.snapshot.status=f.snapshot.status.replace('NoNewPrivs:\t1','NoNewPrivs:\t0')],
 ['no seccomp filter',f=>f.snapshot.status=f.snapshot.status.replace('Seccomp_filters:\t1','Seccomp_filters:\t0')],
 ['SDK changed read-write',f=>f.snapshot.mountinfo=f.snapshot.mountinfo.replace('ro,nosuid,nodev','rw,nosuid,nodev')],
 ['mount overlay',f=>f.snapshot.mountinfo+='900 110 0:100 / /opt/aaraagate-test/flutter/bin rw - tmpfs tmpfs rw\n'],
 ['foreign OCI digest',f=>f.policy.imageDigest='sha256:'+'x'.repeat(64)],
 ['unknown policy',f=>f.policy.allowDispatch=true],
 ['unknown snapshot',f=>f.snapshot.executionApproved=true],
 ['unbounded mountinfo',f=>f.snapshot.mountinfo='x'.repeat(1048577)]
];
for(const [name,mutate] of bad)test('V5.5.42 fails closed on '+name,()=>{
 const f=fixture();mutate(f);
 assert.throws(()=>evaluateTestLinuxObserverSnapshot(f.snapshot,f.policy));
});
test('V5.5.42 reads a real Linux process through fixed /proc (not a fake snapshot)',async()=>{
 if(process.platform!=='linux')return;
 const [s,n]=await Promise.all([
  readFile('/proc/'+process.pid+'/status','utf8'),
  readlink('/proc/'+process.pid+'/ns/mnt')
 ]);
 assert.match(n,/^mnt:\[[1-9][0-9]+\]$/);
 assert.match(s,/^Uid:/m);
 const f=fixture();
 f.policy.pid=process.pid;
 f.policy.mountNamespaceId=n;
 // A normal CI runner lacks a separate pinned, rootless read-only SDK
 // sandbox and must NOT be accepted as an isolated TEST build worker.
 await assert.rejects(inspectLocalTestLinuxRunnerProcess(process.pid,f.policy));
});
