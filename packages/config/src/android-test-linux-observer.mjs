import {readFile,readlink} from 'node:fs/promises';
import {evaluateTestAndroidLinuxIsolationSnapshot} from './android-test-linux-isolation.mjs';

const PID=/^[1-9][0-9]{0,6}$/;
const NS=/^mnt:\[[1-9][0-9]{0,18}\]$/;
const SHA=/^sha256:[0-9a-f]{64}$/;
const fail=m=>{throw Error(m);};
const exact=(x,keys)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 Object.getPrototypeOf(x)===Object.prototype&&Object.keys(x).sort().join(',')===keys.slice().sort().join(',');
const assertPid=pid=>{
 if(!Number.isSafeInteger(pid)||pid<2||pid>4194304||!PID.test(String(pid)))
  fail('Invalid protected Linux TEST observer PID');
 return pid;
};
const bound=(text,max,label)=>{
 if(typeof text!=='string'||text.length<1||text.length>max||text.includes('\0'))
  fail('Invalid or unbounded '+label);
 return text;
};
function identity(stat,pid){
 bound(stat,8192,'Linux process stat');
 // The comm field may contain spaces and literal parentheses. Strip the
 // last closing parenthesis preceding the kernel state and numbered fields.
 const m=/^([1-9][0-9]*) \((.*)\) ([A-Z]) (.+)\n?$/.exec(stat);
 if(!m||Number(m[1])!==pid||['Z','X'].includes(m[3]))
  fail('Exited or foreign Linux observer process');
 const fields=m[4].trim().split(/\s+/);
 // The suffix begins at proc stat field #4 (ppid); starttime is #22.
 if(fields.length<19||!/^[1-9][0-9]{0,19}$/.test(fields[18]))
  fail('No reliable Linux process starttime tick counter');
 return fields[18];
}
const unixIds=(status,label)=>{
 bound(status,128*1024,'Linux status');
 const hits=status.match(new RegExp('^'+label+':\\s*[0-9]+\\s+[0-9]+\\s+[0-9]+\\s+[0-9]+\\s*$','gm'))||[];
 if(hits.length!==1)fail('Missing or ambiguous process '+label);
 const parts=hits[0].split(':')[1].trim().split(/\s+/);
 if(parts.length!==4||parts.some(x=>x!==parts[0])||
    !/^[1-9][0-9]{0,9}$/.test(parts[0])||
    Number(parts[0])>2147483647)
  fail('Foreign or privileged Linux '+label);
 return Number(parts[0]);
};
/**
 * Pure, fixture-testable evaluation of a kernel snapshot. Never treat a
 * caller-provided snapshot as a real measurement. Only the live /proc reader
 * below may assert measuredKernelProcessSnapshot:true.
 */
export function evaluateTestLinuxObserverSnapshot(snapshot,policy){
 const fields=['pid','statBefore','statAfter','mountNamespaceBefore',
   'mountNamespaceAfter','status','mountinfo'];
 const policyFields=['pid','mountNamespaceId','workerId','runId','imageDigest','mounts'];
 if(!exact(snapshot,fields)||!exact(policy,policyFields))
  fail('Untrusted TEST process observer snapshot or policy');
 const pid=assertPid(snapshot.pid);
 if(policy.pid!==pid||typeof policy.mountNamespaceId!=='string'||
    !NS.test(policy.mountNamespaceId)||
    snapshot.mountNamespaceBefore!==policy.mountNamespaceId||
    snapshot.mountNamespaceAfter!==policy.mountNamespaceId||
    !SHA.test(policy.imageDigest))
  fail('Linux observer namespace or independent policy changed');
 const a=identity(snapshot.statBefore,pid),b=identity(snapshot.statAfter,pid);
 if(a!==b)fail('Linux observer target PID was replaced during sampling');
 const uid=unixIds(snapshot.status,'Uid'),gid=unixIds(snapshot.status,'Gid');
 const iso=evaluateTestAndroidLinuxIsolationSnapshot({
  status:snapshot.status,mountinfo:snapshot.mountinfo,uid,gid
 },{
  workerId:policy.workerId,runId:policy.runId,
  imageDigest:policy.imageDigest,mounts:policy.mounts
 });
 return Object.freeze({
  schemaVersion:1,environment:'TEST',testOnly:true,
  pid,processStartTicks:a,mountNamespaceId:policy.mountNamespaceId,
  workerId:policy.workerId,runId:policy.runId,imageDigest:policy.imageDigest,
  stableProcessIdentityPolicyMatched:true,
  mountNamespacePolicyMatched:true,
  kernelProcessConfinementPolicyMatched:iso.isolatedLinuxSnapshotPolicyMatched,
  kernelReadonlySdkMountFlagsObserved:iso.readOnlySdkMountsObserved,
  // The pure evaluator verifies only supplied data; callers MUST NOT
  // promote a synthetic/proxy/partner-controlled snapshot to authority.
  measuredKernelProcessSnapshot:false,
  independentHostOperatorVerified:false,independentOciImageDigestVerified:false,
  runtimeImageAttested:false,immutableMountVerified:false,
  singleUseChallengeConsumed:false,buildExecutionAuthorized:false,
  artifactProduced:false,dispatchAllowed:false
 });
}
/**
 * Read a TARGET process from host-kernel /proc, never a caller-supplied path.
 * Inspects a different pid (not /proc/self); no shell, writes, worker action
 * or execution endpoint. Stable namespace/starttime on both sides of status
 * and mountinfo sampling reduces PID-reuse risk, but not post-check races.
 * Must run under a separately provisioned, authorized host observer to be
 * useful as independent evidence. A local fixture does not establish that.
 */
export async function inspectLocalTestLinuxRunnerProcess(pid,policy){
 if(process.platform!=='linux')fail('Linux /proc required for TEST observer');
 assertPid(pid);
 const root='/proc/'+pid+'/';
 const [statBefore,mountNamespaceBefore]=await Promise.all([
  readFile(root+'stat','utf8'),readlink(root+'ns/mnt')
 ]);
 const [status,mountinfo]=await Promise.all([
  readFile(root+'status','utf8'),readFile(root+'mountinfo','utf8')
 ]);
 const [mountNamespaceAfter,statAfter]=await Promise.all([
  readlink(root+'ns/mnt'),readFile(root+'stat','utf8')
 ]);
 const result=evaluateTestLinuxObserverSnapshot({
  pid,statBefore,statAfter,mountNamespaceBefore,mountNamespaceAfter,
  status,mountinfo
 },policy);
 return Object.freeze({
  ...result,measuredKernelProcessSnapshot:true,
  // Local kernel observation != externally attested host or signed quote.
  independentHostOperatorVerified:false,independentOciImageDigestVerified:false,
  runtimeImageAttested:false,immutableMountVerified:false,
  buildExecutionAuthorized:false,artifactProduced:false,dispatchAllowed:false
 });
}
