import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readlink} from 'node:fs/promises';
import {evaluatePinnedTestLinuxCgroupRootSnapshot,
 inspectLocalTestLinuxRunnerCgroupRoot} from '../packages/config/src/android-test-linux-cgroup-observer.mjs';

const cid='a'.repeat(64),pid=7124;
const ns='mnt:[4026532101]';
const mountPaths=['/opt/aaraagate-test/flutter','/opt/aaraagate-test/android',
 '/opt/aaraagate-test/java','/opt/aaraagate-test/template'];
const mountNames=['flutterSdk','androidSdk','javaHome','nativeTemplate'];
function fixture(){
 const times=(ticks='12003456')=>String(pid)+' (worker (node)) S '+
  Array.from({length:19},(_,i)=>i===18?ticks:'1').join(' ')+'\n';
 const rootMount={root:'/',fsType:'overlay',source:'overlay'};
 const cgroupPath='/system.slice/docker-'+cid+'.scope';
 const policy={pid,processStartTicks:'12003456',
  mountNamespaceId:ns,workerId:'TEST_WORKER_CI_43',
  runId:'TEST_RUN_CI_43',imageDigest:'sha256:'+'b'.repeat(64),
  containerId:cid,cgroupPath,rootMount};
 const mountinfo=[
  '1 0 0:20 / / ro,nosuid,nodev,relatime - overlay overlay ro',
  ...mountNames.map((name,i)=>String(110+i)+' 1 0:'+String(30+i)+
   ' / '+mountPaths[i]+' ro,nosuid,nodev - squashfs /dev/loop'+i+' ro')
 ].join('\n')+'\n';
 const snapshot={pid,statBefore:times(),statAfter:times(),
  mountNamespaceBefore:ns,mountNamespaceAfter:ns,
  cgroup:'0::'+cgroupPath+'\n',mountinfo};
 const status=['Name:\ttest worker','Uid:\t10001\t10001\t10001\t10001',
  'Gid:\t10001\t10001\t10001\t10001',
  'CapInh:\t0000000000000000','CapPrm:\t0000000000000000',
  'CapEff:\t0000000000000000','CapBnd:\t0000000000000000',
  'CapAmb:\t0000000000000000','NoNewPrivs:\t1','Seccomp:\t2',
  'Seccomp_filters:\t1'].join('\n')+'\n';
 const mounts=Object.fromEntries(mountNames.map((name,i)=>[name,{
  path:mountPaths[i],root:'/',fsType:'squashfs',source:'/dev/loop'+i
 }]));
 const observerPolicy={pid,mountNamespaceId:ns,workerId:policy.workerId,
  runId:policy.runId,imageDigest:policy.imageDigest,mounts};
 return {policy,snapshot,status,observerPolicy,times};
}
test('V5.5.43 strict cgroup v2 and rootfs read-only host-local snapshot stays non-authorizing',()=>{
 const f=fixture(),receipt=evaluatePinnedTestLinuxCgroupRootSnapshot(f.snapshot,f.policy);
 assert.equal(receipt.exactCgroupV2PolicyMatched,true);
 assert.equal(receipt.rootMountReadOnlyFlagsMatched,true);
 assert.equal(receipt.stablePidNamespaceObserved,true);
 for(const p of ['measuredKernelRootAndCgroup',
  'independentlyProvisionedObserverVerified','independentlyVerifiedOciImageDigest',
  'runtimeImageAttested','immutableMountVerified','singleUseChallengeConsumed',
  'buildExecutionAuthorized','artifactProduced','dispatchAllowed'])
  assert.equal(receipt[p],false,p);
 assert.ok(Object.isFrozen(receipt));
});
for(const [name,mutate] of [
 ['foreign process',f=>f.snapshot.pid=7125],
 ['reused target PID',f=>f.snapshot.statAfter=f.times('12003457')],
 ['replayed stale starttime',f=>f.policy.processStartTicks='12003457'],
 ['wrong mount namespace',f=>f.snapshot.mountNamespaceAfter='mnt:[4026532102]'],
 ['wrong container ID',f=>f.policy.containerId='0'.repeat(64)],
 ['cgroup v1 fallback',f=>f.snapshot.cgroup='2:cpu:/docker/'+cid+'\n'],
 ['hybrid cgroup extra entry',f=>f.snapshot.cgroup+='1:name=systemd:/wrong\n'],
 ['different cgroup path',f=>f.snapshot.cgroup='0::/docker/'+cid+'\n'],
 ['root cgroup',f=>f.policy.cgroupPath='/'],
 ['cgroup path traversal',f=>f.policy.cgroupPath='/tmp/../docker-'+cid],
 ['missing rootfs',f=>f.snapshot.mountinfo=f.snapshot.mountinfo.split('\n').slice(1).join('\n')],
 ['duplicate rootfs overmount',f=>f.snapshot.mountinfo+='2 0 0:22 / / ro,nosuid,nodev - overlay overlay ro\n'],
 ['writable root mount',f=>f.snapshot.mountinfo=f.snapshot.mountinfo.replace(' / / ro,',' / / rw,')],
 ['writable root superblock',f=>f.snapshot.mountinfo=f.snapshot.mountinfo.replace('overlay overlay ro','overlay overlay rw')],
 ['privileged root mount',f=>f.snapshot.mountinfo=f.snapshot.mountinfo.replace('ro,nosuid,nodev','ro,nodev')],
 ['source mismatch',f=>f.policy.rootMount.source='unexpected'],
 ['fs type mismatch',f=>f.policy.rootMount.fsType='squashfs'],
 ['unapproved policy field',f=>f.policy.dispatchAllowed=true],
 ['unapproved snapshot field',f=>f.snapshot.approved=true],
 ['oversized cgroup',f=>f.snapshot.cgroup='a'.repeat(4097)],
 ['invalid image SHA',f=>f.policy.imageDigest='sha256:'+'Z'.repeat(64)]
])test('V5.5.43 rejects '+name,()=>{
 const f=fixture();mutate(f);
 assert.throws(()=>evaluatePinnedTestLinuxCgroupRootSnapshot(f.snapshot,f.policy));
});
test('V5.5.43 live Linux API refuses ordinary CI process and cannot become release authority',async()=>{
 if(process.platform!=='linux')return;
 const f=fixture(),n=await readlink('/proc/'+process.pid+'/ns/mnt');
 const s=await readFile('/proc/'+process.pid+'/stat','utf8');
 const m=/^([1-9][0-9]*) \((.*)\) ([A-Z]) (.+)\n?$/.exec(s);
 const tokens=m[4].trim().split(/\s+/);
 f.policy.pid=process.pid;
 f.policy.processStartTicks=tokens[18];
 f.policy.mountNamespaceId=n;
 f.observerPolicy.pid=process.pid;
 f.observerPolicy.mountNamespaceId=n;
 // Existing V5.5.42 inspector rejects regular CI without four pinned
 // read-only mountpoints, seccomp and separated TEST worker identity.
 await assert.rejects(inspectLocalTestLinuxRunnerCgroupRoot(process.pid,f.observerPolicy,f.policy));
});
