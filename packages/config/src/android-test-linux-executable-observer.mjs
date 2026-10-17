import {createHash} from 'node:crypto';
import {open,readFile,readlink} from 'node:fs/promises';
import {inspectLocalTestLinuxRunnerCgroupRoot} from './android-test-linux-cgroup-observer.mjs';
const fail=m=>{throw Error(m);};
const exact=(v,k)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join(',')===k.slice().sort().join(',');
const SHA=/^[a-f0-9]{64}$/,PID=/^[1-9][0-9]{0,6}$/,TICKS=/^[1-9][0-9]{0,19}$/;
const MNT=/^mnt:\[[1-9][0-9]{0,18}\]$/,NS=/^(?:pid|user):\[[1-9][0-9]{0,18}\]$/;
const MAX=128*1024*1024;
const policyKeys=['pid','processStartTicks','mountNamespaceId','pidNamespaceId','userNamespaceId','exePath','exeSha256','argvSha256','workerId','runId','imageDigest','containerId'];
const sampleKeys=['pid','statBefore','statAfter','mntBefore','mntAfter','pidNsBefore','pidNsAfter','userNsBefore','userNsAfter','exeBefore','exeAfter','exeSha256','argvSha256','exeBytes'];
function ticks(s,pid){
 if(typeof s!=='string'||s.length>8192||s.includes('\0'))fail('Bad kernel stat');
 const m=/^([1-9][0-9]*) \((.*)\) ([A-Z]) (.+)\n?$/.exec(s);
 if(!m||Number(m[1])!==pid||['Z','X'].includes(m[3]))fail('Foreign or exited process');
 const parts=m[4].trim().split(/\s+/);
 if(parts.length<19||!TICKS.test(parts[18]))fail('No pinned PID starttime');
 return parts[18];
}
/** Pure parser: untrusted snapshots NEVER establish real kernel measurements. */
export function evaluatePinnedTestLinuxExecutableSnapshot(s,p){
 if(!exact(s,sampleKeys)||!exact(p,policyKeys))fail('Unexpected executable observer schema');
 if(!Number.isSafeInteger(p.pid)||p.pid<2||p.pid>4194304||!PID.test(String(p.pid))||
  s.pid!==p.pid||!TICKS.test(p.processStartTicks)||!MNT.test(p.mountNamespaceId)||
  !/^pid:\[[1-9][0-9]{0,18}\]$/.test(p.pidNamespaceId)||
  !/^user:\[[1-9][0-9]{0,18}\]$/.test(p.userNamespaceId)||
  !/^TEST_WORKER_[A-Z0-9_]{3,48}$/.test(p.workerId)||
  !/^TEST_RUN_[A-Z0-9_]{3,48}$/.test(p.runId)||
  !/^sha256:[a-f0-9]{64}$/.test(p.imageDigest)||!SHA.test(p.containerId)||
  !SHA.test(p.exeSha256)||!SHA.test(p.argvSha256)||
  typeof p.exePath!=='string'||p.exePath.length>512||
  !p.exePath.startsWith('/')||p.exePath.includes('//')||
  p.exePath.split('/').some(x=>x==='..'||x==='.')||
  /[\x00-\x20\x7f\\]/.test(p.exePath)||p.exePath.endsWith(' (deleted)'))
  fail('Unpinned TEST process binary or namespace policy');
 if(s.mntBefore!==p.mountNamespaceId||s.mntAfter!==p.mountNamespaceId||
    s.pidNsBefore!==p.pidNamespaceId||s.pidNsAfter!==p.pidNamespaceId||
    s.userNsBefore!==p.userNamespaceId||s.userNsAfter!==p.userNamespaceId||
    !NS.test(s.pidNsBefore)||!NS.test(s.userNsBefore)||
    ticks(s.statBefore,p.pid)!==p.processStartTicks||
    ticks(s.statAfter,p.pid)!==p.processStartTicks)
  fail('PID reuse or Linux namespace changed during executable sampling');
 if(s.exeBefore!==p.exePath||s.exeAfter!==p.exePath||
    s.exeSha256!==p.exeSha256||s.argvSha256!==p.argvSha256||
    !Number.isSafeInteger(s.exeBytes)||s.exeBytes<1||s.exeBytes>MAX)
  fail('Executable bytes, symlink or argv differ from independently pinned identity');
 return Object.freeze({
  schemaVersion:1,environment:'TEST',testOnly:true,
  pid:p.pid,workerId:p.workerId,runId:p.runId,containerId:p.containerId,
  processStartTicks:p.processStartTicks,
  mountNamespaceId:p.mountNamespaceId,pidNamespaceId:p.pidNamespaceId,
  userNamespaceId:p.userNamespaceId,exeSha256:p.exeSha256,
  argvSha256:p.argvSha256,exeBytes:s.exeBytes,
  stableTargetProcessNamespaces:true,pinnedExecutableAndArgvHashesVerified:true,
  measuredKernelExecutable:false,independentObserverVerified:false,
  independentOciImageDigestVerified:false,runtimeImageAttested:false,
  immutableMountVerified:false,singleUseChallengeConsumed:false,
  buildExecutionAuthorized:false,artifactProduced:false,dispatchAllowed:false
 });
}
/**
 * Real read-only host-local /proc target PID sampling. A previously trusted
 * V5.5.43 read-only root/cgroup check must pass first. No shell, socket,
 * host path provided by a partner, execution or worker commands.
 */
export async function inspectLocalTestLinuxRunnerExecutable(pid,observerPolicy,cgroupPolicy,policy){
 if(process.platform!=='linux'||!exact(policy,policyKeys)||
  policy.pid!==pid||cgroupPolicy?.pid!==pid||observerPolicy?.pid!==pid||
  cgroupPolicy.processStartTicks!==policy.processStartTicks||
  cgroupPolicy.mountNamespaceId!==policy.mountNamespaceId||
  cgroupPolicy.workerId!==policy.workerId||cgroupPolicy.runId!==policy.runId||
  cgroupPolicy.containerId!==policy.containerId||
  cgroupPolicy.imageDigest!==policy.imageDigest)
  fail('Inconsistent TEST Linux observer scope');
 const prior=await inspectLocalTestLinuxRunnerCgroupRoot(pid,observerPolicy,cgroupPolicy);
 if(prior.measuredKernelRootAndCgroup!==true||prior.processStartTicks!==policy.processStartTicks)
  fail('No fresh trusted local cgroup/root observation');
 const root='/proc/'+pid+'/';
 const [statBefore,mntBefore,pidNsBefore,userNsBefore,exeBefore]=await Promise.all([
  readFile(root+'stat','utf8'),readlink(root+'ns/mnt'),readlink(root+'ns/pid'),
  readlink(root+'ns/user'),readlink(root+'exe')]);
 let exeBytes=0;const hash=createHash('sha256'),buffer=Buffer.alloc(65536);
 const h=await open(root+'exe','r');
 try{
  const before=await h.stat();
  if(!before.isFile()||before.size<1||before.size>MAX)
   fail('Unbounded or nonregular TEST executable');
  while(true){
   const {bytesRead}=await h.read(buffer,0,buffer.length,exeBytes);
   if(!bytesRead)break;
   exeBytes+=bytesRead;
   if(exeBytes>MAX)fail('Excessive executable byte size');
   hash.update(buffer.subarray(0,bytesRead));
  }
  const after=await h.stat();
  if(exeBytes!==before.size||before.dev!==after.dev||before.ino!==after.ino||
     before.size!==after.size||before.mtimeMs!==after.mtimeMs)
   fail('Executable bytes or inode changed during observation');
 }finally{await h.close();}
 const argv=await readFile(root+'cmdline');
 if(!argv.length||argv.length>4096||argv[argv.length-1]!==0)
  fail('Unbounded TEST process argv');
 const [exeAfter,userNsAfter,pidNsAfter,mntAfter,statAfter]=await Promise.all([
  readlink(root+'exe'),readlink(root+'ns/user'),readlink(root+'ns/pid'),
  readlink(root+'ns/mnt'),readFile(root+'stat','utf8')]);
 const checked=evaluatePinnedTestLinuxExecutableSnapshot({
  pid,statBefore,statAfter,mntBefore,mntAfter,pidNsBefore,pidNsAfter,
  userNsBefore,userNsAfter,exeBefore,exeAfter,
  exeSha256:hash.digest('hex'),argvSha256:createHash('sha256').update(argv).digest('hex'),
  exeBytes
 },policy);
 return Object.freeze({...checked,measuredKernelExecutable:true,
  independentObserverVerified:false,independentOciImageDigestVerified:false,
  runtimeImageAttested:false,immutableMountVerified:false,
  singleUseChallengeConsumed:false,buildExecutionAuthorized:false,
  artifactProduced:false,dispatchAllowed:false});
}
