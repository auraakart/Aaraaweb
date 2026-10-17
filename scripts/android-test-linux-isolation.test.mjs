import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTestAndroidLinuxIsolationSnapshot } from '../packages/config/src/android-test-linux-isolation.mjs';

const names=['flutterSdk','androidSdk','javaHome','nativeTemplate'];
function fixture(){
 const paths=['/opt/aaraagate-test/flutter','/opt/aaraagate-test/android',
  '/opt/aaraagate-test/java','/opt/aaraagate-test/template'];
 const mounts=Object.fromEntries(names.map((name,i)=>[name,{
  path:paths[i],root:'/',fsType:'squashfs',source:'/dev/loop'+i
 }]));
 const status=['Name:\tnode','Uid:\t10001\t10001\t10001\t10001',
  'Gid:\t10001\t10001\t10001\t10001',
  'CapInh:\t0000000000000000','CapPrm:\t0000000000000000',
  'CapEff:\t0000000000000000','CapBnd:\t0000000000000000',
  'CapAmb:\t0000000000000000','NoNewPrivs:\t1','Seccomp:\t2',
  'Seccomp_filters:\t1'].join('\n')+'\n';
 const mountinfo=[
  '1 0 8:1 / / rw,relatime - ext4 /dev/root rw',
  '20 1 0:4 / /proc rw,nosuid,nodev - proc proc rw',
  '21 1 0:5 / /sys ro,nosuid,nodev - sysfs sysfs ro',
  '22 1 0:6 / /dev/pts rw,nosuid,noexec - devpts devpts rw',
  '23 1 0:7 / /dev/mqueue rw,nosuid,nodev - mqueue mqueue rw',
  ...names.map((name,i)=>(
   (130+i)+' 1 0:'+(20+i)+' / '+mounts[name].path+
    ' ro,nosuid,nodev,relatime - squashfs /dev/loop'+i+' ro'
  ))
 ].join('\n')+'\n';
 const policy={workerId:'TEST_WORKER_CI_01',runId:'TEST_RUN_CI_01',
  imageDigest:'sha256:'+'f'.repeat(64),mounts};
 const snapshot={status,mountinfo,uid:10001,gid:10001};
 return {snapshot,policy};
}
test('V5.5.19 requires exact read-only pinned SDKs and non-root seccomp confinement',()=>{
 const {snapshot,policy}=fixture(),got=evaluateTestAndroidLinuxIsolationSnapshot(snapshot,policy);
 assert.equal(got.isolatedLinuxSnapshotPolicyMatched,true);
 assert.equal(got.readOnlySdkMountsObserved,true);
 assert.equal(got.noCapabilitiesObserved,true);
 assert.equal(got.noNewPrivilegesObserved,true);
 assert.equal(got.seccompFilterObserved,true);
 assert.equal(got.pinnedMountCount,4);
 assert.equal(got.runtimeImageAttested,false);
 assert.equal(got.immutableMountVerified,false);
 assert.equal(got.buildExecutionAuthorized,false);
 assert.equal(got.dispatchAllowed,false);
});
const problems=[
 ['root account',x=>{x.snapshot.uid=0;}],
 ['changed UID',x=>{x.snapshot.uid=10002;}],
 ['changed GID',x=>{x.snapshot.gid=10002;}],
 ['effective Linux capability',x=>{x.snapshot.status=x.snapshot.status.replace('CapEff:\t0000000000000000','CapEff:\t0000000000000001');}],
 ['bounding Linux capability',x=>{x.snapshot.status=x.snapshot.status.replace('CapBnd:\t0000000000000000','CapBnd:\t0000000000000001');}],
 ['privileged process',x=>{x.snapshot.status=x.snapshot.status.replace('NoNewPrivs:\t1','NoNewPrivs:\t0');}],
 ['missing seccomp',x=>{x.snapshot.status=x.snapshot.status.replace('Seccomp:\t2','Seccomp:\t0');}],
 ['no filters',x=>{x.snapshot.status=x.snapshot.status.replace('Seccomp_filters:\t1','Seccomp_filters:\t0');}],
 ['duplicate security status',x=>{x.snapshot.status+='CapEff:\t0000000000000000\n';}],
 ['read write bind mount',x=>{x.snapshot.mountinfo=x.snapshot.mountinfo.replace('ro,nosuid,nodev,relatime - squashfs','rw,nosuid,nodev,relatime - squashfs');}],
 ['setuid enabled mount',x=>{x.snapshot.mountinfo=x.snapshot.mountinfo.replace('ro,nosuid,nodev,relatime - squashfs','ro,suid,nodev,relatime - squashfs');}],
 ['device enabled mount',x=>{x.snapshot.mountinfo=x.snapshot.mountinfo.replace('ro,nosuid,nodev,relatime - squashfs','ro,nosuid,dev,relatime - squashfs');}],
 ['removed SDK mount',x=>{x.snapshot.mountinfo=x.snapshot.mountinfo.replace(/^130 [^\n]*\n/m,'');}],
 ['foreign mount backing',x=>{x.policy.mounts.flutterSdk.source='/dev/foreign';}],
 ['nested SDK overmount',x=>{x.snapshot.mountinfo+='200 130 0:88 / /opt/aaraagate-test/flutter/bin rw - tmpfs tmpfs rw\n';}],
 ['duplicate SDK mount',x=>{x.snapshot.mountinfo+='201 1 0:20 / /opt/aaraagate-test/flutter ro,nosuid,nodev - squashfs /dev/loop0 ro\n';}],
 ['overlapping SDK policy',x=>{x.policy.mounts.nativeTemplate.path='/opt/aaraagate-test/flutter/sub';}],
 ['malicious bind path',x=>{x.policy.mounts.flutterSdk.path='/etc/shadow';}],
 ['unknown filesystem',x=>{x.policy.mounts.flutterSdk.fsType='proc';}],
 ['untrusted remote image claim',x=>{x.policy.imageDigest='latest';}],
 ['foreign worker',x=>{x.policy.workerId='TEST_WORKER_INVALID_01';x.policy.workerId='WRONG';}],
 ['extra policy key',x=>{x.policy.allowDispatch=true;}],
 ['truncated mountinfo',x=>{x.snapshot.mountinfo='bad';}],
 ['unbounded mountinfo',x=>{x.snapshot.mountinfo='x'.repeat(1100000);}]
];
for(const [label,mutate] of problems)test('V5.5.19 denies '+label,()=>{
 const x=fixture();mutate(x);
 assert.throws(()=>evaluateTestAndroidLinuxIsolationSnapshot(x.snapshot,x.policy));
});
