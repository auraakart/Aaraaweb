import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readlink} from 'node:fs/promises';
import {evaluatePinnedTestLinuxExecutableSnapshot,inspectLocalTestLinuxRunnerExecutable}
 from '../packages/config/src/android-test-linux-executable-observer.mjs';

const pid=7124,cid='a'.repeat(64);
const stat=(tick='12003456')=>String(pid)+' (node (TEST worker)) S '+
 Array.from({length:19},(_,i)=>i===18?tick:'1').join(' ')+'\n';
function fixture(){
 const policy={pid,processStartTicks:'12003456',mountNamespaceId:'mnt:[4026532101]',
  pidNamespaceId:'pid:[4026532102]',userNamespaceId:'user:[4026532103]',
  exePath:'/usr/local/bin/node',exeSha256:'b'.repeat(64),argvSha256:'c'.repeat(64),
  workerId:'TEST_WORKER_CI_44',runId:'TEST_RUN_CI_44',
  imageDigest:'sha256:'+'d'.repeat(64),containerId:cid};
 const snapshot={pid,statBefore:stat(),statAfter:stat(),
  mntBefore:policy.mountNamespaceId,mntAfter:policy.mountNamespaceId,
  pidNsBefore:policy.pidNamespaceId,pidNsAfter:policy.pidNamespaceId,
  userNsBefore:policy.userNamespaceId,userNsAfter:policy.userNamespaceId,
  exeBefore:policy.exePath,exeAfter:policy.exePath,
  exeSha256:policy.exeSha256,argvSha256:policy.argvSha256,exeBytes:27849};
 return {policy,snapshot};
}
test('V5.5.44 static pinned executable and namespace snapshot has zero build authority',()=>{
 const {snapshot,policy}=fixture();
 const receipt=evaluatePinnedTestLinuxExecutableSnapshot(snapshot,policy);
 assert.equal(receipt.pinnedExecutableAndArgvHashesVerified,true);
 assert.equal(receipt.stableTargetProcessNamespaces,true);
 assert.equal(receipt.exeBytes,27849);
 for(const k of ['measuredKernelExecutable','independentObserverVerified',
  'independentOciImageDigestVerified','runtimeImageAttested','immutableMountVerified',
  'singleUseChallengeConsumed','buildExecutionAuthorized','artifactProduced','dispatchAllowed'])
  assert.equal(receipt[k],false,k);
 assert.ok(Object.isFrozen(receipt));
});
const negative=[
 ['PID mismatch',f=>{f.snapshot.pid=7125;}],
 ['PID reuse',f=>{f.snapshot.statAfter=stat('12003457');}],
 ['stale starttime',f=>{f.policy.processStartTicks='12003457';}],
 ['exited PID',f=>{f.snapshot.statAfter=f.snapshot.statAfter.replace(') S ',') Z ');}],
 ['mount namespace swap',f=>{f.snapshot.mntAfter='mnt:[4026532111]';}],
 ['PID namespace swap',f=>{f.snapshot.pidNsAfter='pid:[4026532111]';}],
 ['user namespace swap',f=>{f.snapshot.userNsAfter='user:[4026532111]';}],
 ['binary symlink substitution',f=>{f.snapshot.exeAfter='/usr/local/bin/other';}],
 ['deleted executable path',f=>{f.policy.exePath='/usr/bin/node (deleted)';}],
 ['unexpected executable digest',f=>{f.snapshot.exeSha256='f'.repeat(64);}],
 ['unexpected argv bytes',f=>{f.snapshot.argvSha256='f'.repeat(64);}],
 ['oversized executable',f=>{f.snapshot.exeBytes=129*1024*1024;}],
 ['untrusted OCI image policy',f=>{f.policy.imageDigest='latest';}],
 ['unknown policy permission',f=>{f.policy.dispatchAllowed=true;}],
 ['unknown snapshot permission',f=>{f.snapshot.buildExecutionAuthorized=true;}]
];
for(const [name,mutate] of negative)test('V5.5.44 refuses '+name,()=>{
 const f=fixture();mutate(f);
 assert.throws(()=>evaluatePinnedTestLinuxExecutableSnapshot(f.snapshot,f.policy));
});
test('V5.5.44 live CI process is NOT an approved isolated TEST executable worker',async()=>{
 if(process.platform!=='linux')return;
 const f=fixture(),root='/proc/'+process.pid+'/';
 const [mnt,statText]=await Promise.all([readlink(root+'ns/mnt'),readFile(root+'stat','utf8')]);
 const ticks=/^([1-9][0-9]*) \((.*)\) ([A-Z]) (.+)\n?$/.exec(statText)[4].trim().split(/\s+/)[18];
 const cg={pid:process.pid,processStartTicks:ticks,mountNamespaceId:mnt,
  workerId:f.policy.workerId,runId:f.policy.runId,imageDigest:f.policy.imageDigest,
  containerId:cid,cgroupPath:'/system.slice/docker-'+cid+'.scope',
  rootMount:{root:'/',fsType:'overlay',source:'overlay'}};
 const obs={pid:process.pid,mountNamespaceId:mnt,
  workerId:f.policy.workerId,runId:f.policy.runId,imageDigest:f.policy.imageDigest,
  mounts:{flutterSdk:{path:'/opt/aaraagate-test/flutter',root:'/',fsType:'squashfs',source:'/dev/loop1'},
   androidSdk:{path:'/opt/aaraagate-test/android',root:'/',fsType:'squashfs',source:'/dev/loop2'},
   javaHome:{path:'/opt/aaraagate-test/java',root:'/',fsType:'squashfs',source:'/dev/loop3'},
   nativeTemplate:{path:'/opt/aaraagate-test/template',root:'/',fsType:'squashfs',source:'/dev/loop4'}}};
 f.policy.pid=process.pid;f.policy.processStartTicks=ticks;f.policy.mountNamespaceId=mnt;
 await assert.rejects(inspectLocalTestLinuxRunnerExecutable(process.pid,obs,cg,f.policy));
});
