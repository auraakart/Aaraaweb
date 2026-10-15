import {readFile,readlink} from 'node:fs/promises';
import {inspectLocalTestLinuxRunnerProcess} from './android-test-linux-observer.mjs';

const fail=m=>{throw Error(m);};
const exact=(x,keys)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 Object.getPrototypeOf(x)===Object.prototype&&Object.keys(x).sort().join(',')===keys.slice().sort().join(',');
const PID=/^[1-9][0-9]{0,6}$/;
const TICKS=/^[1-9][0-9]{0,19}$/;
const NS=/^mnt:\[[1-9][0-9]{0,18}\]$/;
const CID=/^[a-f0-9]{64}$/;
const IMAGE=/^sha256:[a-f0-9]{64}$/;
const WORKER=/^TEST_WORKER_[A-Z0-9_]{3,48}$/;
const RUN=/^TEST_RUN_[A-Z0-9_]{3,48}$/;
const file=(value,max,name)=>{
 if(typeof value!=='string'||!value.length||value.length>max||value.includes('\0'))
  fail('Invalid kernel '+name);
 return value;
};
const start=(stat,pid)=>{
 file(stat,8192,'stat');
 const m=/^([1-9][0-9]*) \((.*)\) ([A-Z]) (.+)\n?$/.exec(stat);
 if(!m||Number(m[1])!==pid||['Z','X'].includes(m[3]))
  fail('Kernel target PID exited or changed');
 const fields=m[4].trim().split(/\s+/),ticks=fields[18];
 if(fields.length<19||!TICKS.test(ticks))fail('No stable kernel PID starttime');
 return ticks;
};
const cgroupPath=p=>typeof p==='string'&&
 p.length>66&&p.length<512&&p.startsWith('/')&&!p.includes('//')&&
 !p.includes('..')&&!p.includes('\\')&&
 /^\/[A-Za-z0-9_./:-]+$/.test(p);
const parseRoot=text=>{
 file(text,1024*1024,'mountinfo');
 const roots=[];
 for(const line of text.trimEnd().split('\n')){
  if(!line||line.length>4096)fail('Malformed kernel mountinfo line');
  const halves=line.split(' - ');
  if(halves.length!==2)fail('Malformed kernel mountinfo delimiter');
  const left=halves[0].split(' '),right=halves[1].split(' ');
  if(left.length<6||right.length<3)fail('Malformed kernel mountinfo record');
  if(left[4]==='/'){
   if(!/^\d+$/.test(left[0])||!/^\d+$/.test(left[1])||
      !/^\d+:\d+$/.test(left[2]))
    fail('Untrusted root mount metadata');
   roots.push({root:left[3],flags:left[5].split(','),
    fsType:right[0],source:right[1],superFlags:right[2].split(',')});
  }
 }
 if(roots.length!==1)fail('Missing or overmounted kernel root filesystem');
 return roots[0];
};
/**
 * Read-only host-local Linux kernel observation. A synthetic snapshot only
 * demonstrates parser correctness and can NEVER establish an external image,
 * operator identity, persistent challenge, or any build authority.
 */
export function evaluatePinnedTestLinuxCgroupRootSnapshot(snapshot,policy){
 const keys=['pid','statBefore','statAfter','mountNamespaceBefore',
  'mountNamespaceAfter','cgroup','mountinfo'];
 const pinned=['pid','processStartTicks','mountNamespaceId','workerId','runId',
  'imageDigest','containerId','cgroupPath','rootMount'];
 if(!exact(snapshot,keys)||!exact(policy,pinned))
  fail('Untrusted TEST kernel cgroup/root snapshot or policy');
 const pid=policy.pid;
 if(!Number.isSafeInteger(pid)||pid<2||pid>4194304||
    !PID.test(String(pid))||snapshot.pid!==pid||!TICKS.test(policy.processStartTicks)||
    !NS.test(policy.mountNamespaceId)||!WORKER.test(policy.workerId)||
    !RUN.test(policy.runId)||!IMAGE.test(policy.imageDigest)||
    !CID.test(policy.containerId)||!cgroupPath(policy.cgroupPath)||
    !policy.cgroupPath.split(/[\/.:-]/).includes(policy.containerId)||
    snapshot.mountNamespaceBefore!==policy.mountNamespaceId||
    snapshot.mountNamespaceAfter!==policy.mountNamespaceId)
  fail('Missing independently pinned TEST container process/cgroup policy');
 const a=start(snapshot.statBefore,pid),b=start(snapshot.statAfter,pid);
 if(a!==b||a!==policy.processStartTicks)
  fail('TEST Linux PID reuse or process starttime policy mismatch');
 const cg=file(snapshot.cgroup,4096,'cgroup v2');
 // Hybrid/v1 hierarchies and extra lines are explicitly unsupported. Paths
 // must be pinned by an independent operator, not derived from a worker claim.
 if(cg!==('0::'+policy.cgroupPath+'\n'))
  fail('Untrusted TEST cgroup v2 membership or controllers');
 if(!exact(policy.rootMount,['root','fsType','source'])||
    policy.rootMount.root!=='/'||
    !['overlay','squashfs','erofs','ext4','xfs','btrfs'].includes(policy.rootMount.fsType)||
    typeof policy.rootMount.source!=='string'||
    policy.rootMount.source.length<1||policy.rootMount.source.length>512||
    /[\s\\\0]/.test(policy.rootMount.source))
  fail('Missing operator-pinned TEST root filesystem policy');
 const root=parseRoot(snapshot.mountinfo);
 if(root.root!==policy.rootMount.root||
    root.fsType!==policy.rootMount.fsType||
    root.source!==policy.rootMount.source||
    !root.flags.includes('ro')||root.flags.includes('rw')||
    !root.flags.includes('nosuid')||!root.flags.includes('nodev')||
    !root.superFlags.includes('ro')||root.superFlags.includes('rw'))
  fail('Untrusted or writable TEST root filesystem mount');
 return Object.freeze({
  schemaVersion:1,environment:'TEST',testOnly:true,
  pid,processStartTicks:a,mountNamespaceId:policy.mountNamespaceId,
  containerId:policy.containerId,imageDigest:policy.imageDigest,
  workerId:policy.workerId,runId:policy.runId,
  exactCgroupV2PolicyMatched:true,
  rootMountReadOnlyFlagsMatched:true,
  rootMountBackingPolicyMatched:true,
  stablePidNamespaceObserved:true,
  // Parser output is an assertion about supplied data, not live evidence.
  measuredKernelRootAndCgroup:false,
  independentlyProvisionedObserverVerified:false,
  independentlyVerifiedOciImageDigest:false,
  runtimeImageAttested:false,immutableMountVerified:false,
  singleUseChallengeConsumed:false,
  buildExecutionAuthorized:false,artifactProduced:false,dispatchAllowed:false
 });
}
/**
 * Inspect a DIFFERENT process through fixed /proc/<pid> paths only. Always
 * first require the existing V5.5.42 live SDK isolation observer to pass,
 * then read root mount and cgroup with an additional identity/namespace
 * double sample. No shell, writes, kernel mutation or execution endpoint.
 */
export async function inspectLocalTestLinuxRunnerCgroupRoot(pid,observerPolicy,policy){
 if(process.platform!=='linux')fail('Linux required for TEST host observer');
 if(!exact(policy,['pid','processStartTicks','mountNamespaceId','workerId','runId',
    'imageDigest','containerId','cgroupPath','rootMount'])||
    !observerPolicy||observerPolicy.pid!==pid||policy.pid!==pid||
    observerPolicy.workerId!==policy.workerId||
    observerPolicy.runId!==policy.runId||
    observerPolicy.imageDigest!==policy.imageDigest||
    observerPolicy.mountNamespaceId!==policy.mountNamespaceId)
  fail('Host observer and root/cgroup operator policy mismatch');
 const prior=await inspectLocalTestLinuxRunnerProcess(pid,observerPolicy);
 if(prior.measuredKernelProcessSnapshot!==true||
    prior.processStartTicks!==policy.processStartTicks||
    prior.mountNamespaceId!==policy.mountNamespaceId)
  fail('Prior live TEST SDK isolation identity changed');
 const prefix='/proc/'+pid+'/';
 const [statBefore,mountNamespaceBefore]=await Promise.all([
  readFile(prefix+'stat','utf8'),readlink(prefix+'ns/mnt')
 ]);
 const [cgroup,mountinfo]=await Promise.all([
  readFile(prefix+'cgroup','utf8'),readFile(prefix+'mountinfo','utf8')
 ]);
 const [mountNamespaceAfter,statAfter]=await Promise.all([
  readlink(prefix+'ns/mnt'),readFile(prefix+'stat','utf8')
 ]);
 const checked=evaluatePinnedTestLinuxCgroupRootSnapshot({
  pid,statBefore,statAfter,mountNamespaceBefore,mountNamespaceAfter,
  cgroup,mountinfo
 },policy);
 return Object.freeze({
  ...checked,measuredKernelRootAndCgroup:true,
  // A live host-local read is not a remotely authenticated attestation.
  independentlyProvisionedObserverVerified:false,
  independentlyVerifiedOciImageDigest:false,runtimeImageAttested:false,
  immutableMountVerified:false,singleUseChallengeConsumed:false,
  buildExecutionAuthorized:false,artifactProduced:false,dispatchAllowed:false
 });
}
