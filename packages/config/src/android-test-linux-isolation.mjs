import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';
import { androidBuildManifestDigest } from './android-build-contract.mjs';

const NAMES=Object.freeze(['flutterSdk','androidSdk','javaHome','nativeTemplate']);
const SHA=/^[a-f0-9]{64}$/, GIT=/^[a-f0-9]{40}$/;
const WORKER=/^TEST_WORKER_[A-Z0-9_]{3,48}$/, RUN=/^TEST_RUN_[A-Z0-9_]{3,48}$/;
const IMAGE=/^sha256:[a-f0-9]{64}$/;
const fail=message=>{throw new Error(message);};
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 Object.getPrototypeOf(v)===Object.prototype&&
 Object.keys(v).sort().join(',')===keys.slice().sort().join(',');
const abs=p=>typeof p==='string'&&isAbsolute(p)&&resolve(p)===p&&
 p!=='/'&&!p.includes('\\')&&!/[\x00-\x20\x7f]/.test(p);
const within=(path,parent)=>path.startsWith(parent+sep);
const supportedFs=new Set(['ext4','xfs','squashfs','erofs','overlay','btrfs']);

/**
 * Strictly parse Linux kernel-generated mount metadata. This pure parser is
 * separately testable with fixtures, but caller-supplied snapshots alone are
 * NEVER authority. Production code MUST read /proc/self from inside a
 * separately authenticated, unprivileged, isolated TEST worker process.
 */
function parseMountInfo(text){
 if(typeof text!=='string'||text.length<10||text.length>1024*1024)
  fail('Missing or excessive Linux mountinfo');
 const mounts=[];
 for(const line of text.trimEnd().split('\n')){
  if(!line||line.length>4096)fail('Malformed Linux mountinfo record');
  const fields=line.split(' - ');
  if(fields.length!==2)fail('Unexpected Linux mountinfo delimiter');
  const left=fields[0].split(' '),right=fields[1].split(' ');
  if(left.length<6||right.length<3||
     !/^\d+$/.test(left[0])||!/^\d+$/.test(left[1])||
     !/^\d+:\d+$/.test(left[2]))
   fail('Unrecognized Linux mount record');
  const [,,device,root,path,options]=left;
  // Mountinfo contains unrelated, valid kernel mounts (including `/`,
  // devpts, mqueue, tmpfs, etc.). Strict allowlisting belongs only to
  // the FOUR expected SDK mountpoints below, not the whole mount table.
  if(!isAbsolute(path)||!isAbsolute(root)||!options||
     !/^[a-zA-Z0-9_.-]{1,64}$/.test(right[0]))
   fail('Unrecognized Linux mountpoint or filesystem');
  mounts.push({path,root,device,options:options.split(','),fsType:right[0],source:right[1]});
  if(mounts.length>8192)fail('Excessive Linux mounts');
 }
 return mounts;
}
function statusNumber(text,key){
 const hits=text.match(new RegExp('^'+key+':\\s*([^\\n]+)$','gm'))||[];
 if(hits.length!==1)fail('Missing or duplicated Linux status '+key);
 return hits[0].split(':')[1].trim();
}
/**
 * Check a Linux runner kernel snapshot against an independently set mount
 * policy. Pure evaluation does not prove a genuine container or OCI image.
 * The live verifier below does not accept caller-supplied /proc contents.
 */
export function evaluateTestAndroidLinuxIsolationSnapshot(snapshot,policy){
 if(!exact(snapshot,['status','mountinfo','uid','gid'])||
    typeof snapshot.status!=='string'||snapshot.status.length>128*1024||
    !Number.isSafeInteger(snapshot.uid)||snapshot.uid<1||
    !Number.isSafeInteger(snapshot.gid)||snapshot.gid<1||
    !exact(policy,['workerId','runId','imageDigest','mounts'])||
    !WORKER.test(policy.workerId)||!RUN.test(policy.runId)||
    !IMAGE.test(policy.imageDigest)||!exact(policy.mounts,NAMES))
  fail('Missing independently pinned isolated TEST runtime policy');
 const uid=statusNumber(snapshot.status,'Uid').split(/\s+/);
 const gid=statusNumber(snapshot.status,'Gid').split(/\s+/);
 if(uid.length!==4||gid.length!==4||
    uid.some(v=>v!==String(snapshot.uid))||
    gid.some(v=>v!==String(snapshot.gid)))
  fail('TEST runner requires a single unprivileged Unix identity');
 for(const key of ['CapInh','CapPrm','CapEff','CapBnd','CapAmb']){
  if(!/^0+$/.test(statusNumber(snapshot.status,key)))
   fail('TEST runner must have no Linux capabilities: '+key);
 }
 if(statusNumber(snapshot.status,'NoNewPrivs')!=='1'||
    statusNumber(snapshot.status,'Seccomp')!=='2'||
    !/^[1-9]\d*$/.test(statusNumber(snapshot.status,'Seccomp_filters')))
  fail('TEST runner requires no_new_privs and an active seccomp filter');
 const records=parseMountInfo(snapshot.mountinfo);
 const paths=[];
 for(const name of NAMES){
  const pin=policy.mounts[name];
  if(!exact(pin,['path','root','fsType','source'])||
     !abs(pin.path)||pin.path.startsWith('/proc/')||
     pin.path.startsWith('/sys/')||pin.path.startsWith('/dev/')||
     pin.path.startsWith('/run/')||
     !isAbsolute(pin.root)||!supportedFs.has(pin.fsType)||
     typeof pin.source!=='string'||pin.source.length<1||pin.source.length>512||
     /[\x00-\x20\x7f]/.test(pin.source))
   fail('Invalid pinned Linux TEST SDK mount');
  paths.push(pin.path);
  const matches=records.filter(record=>record.path===pin.path);
  if(matches.length!==1)fail('SDK mount is absent or overmounted: '+name);
  const mount=matches[0],options=new Set(mount.options);
  if(mount.root!==pin.root||mount.fsType!==pin.fsType||
     mount.source!==pin.source||
     !options.has('ro')||options.has('rw')||
     !options.has('nosuid')||!options.has('nodev'))
   fail('Untrusted or writable TEST SDK mount: '+name);
  if(records.some(record=>within(record.path,pin.path)))
   fail('Unexpected nested mount can shadow approved SDK bytes: '+name);
 }
 for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++){
  if(paths[i]===paths[j]||within(paths[i],paths[j])||within(paths[j],paths[i]))
   fail('Overlapping protected TEST SDK mounts');
 }
 return Object.freeze({
  isolatedLinuxSnapshotPolicyMatched:true,unprivilegedIdentityObserved:true,
  noCapabilitiesObserved:true,noNewPrivilegesObserved:true,
  seccompFilterObserved:true,readOnlySdkMountsObserved:true,
  pinnedMountCount:NAMES.length,
  // Local mount configuration is not evidence of an independently
  // measured/executed OCI image or a cryptographically immutable runtime.
  runtimeImageAttested:false,immutableMountVerified:false,
  buildExecutionAuthorized:false,dispatchAllowed:false
 });
}
/**
 * Fail-closed live check IN THE runner process. This has no filesystem writes,
 * no command execution and no build dispatch. The trusted runner must mount
 * separately pinned SDK trees read-only BEFORE invoking it.
 */
export async function verifyLocalTestAndroidRunnerIsolation(plan,acceptance,transport,sdk,policy){
 const m=plan?.manifest;
 if(process.platform!=='linux'||typeof process.getuid!=='function'||
    typeof process.getgid!=='function')
  fail('Isolated TEST runtime requires Linux');
 if(!plan||plan.testOnly!==true||plan.dispatchAllowed!==false||
    plan.requiresVersionReservation!==true||!m||m.schemaVersion!==1||
    m.buildMode!=='TEST'||!['RESIDENT','GUARD'].includes(m.appRole)||
    plan.appDirectory!=='apps/'+m.appRole.toLowerCase()||
    !GIT.test(m.sourceSha)||!SHA.test(m.lockDigest)||
    plan.manifestDigest!==androidBuildManifestDigest(m))
  fail('Invalid TEST runner isolation plan');
 if(!acceptance||acceptance.testOnly!==true||
    acceptance.status!=='SIGNED_TEST_EVIDENCE_ACCEPTED_NO_EXECUTION'||
    acceptance.workerSignatureVerified!==true||
    acceptance.serverReplayBarrierVerified!==true||
    acceptance.dispatchAllowed!==false||
    acceptance.artifactProduced!==false||
    acceptance.manifestDigest!==plan.manifestDigest)
  fail('Missing durable one-use TEST runner acceptance');
 if(!transport||transport.testOnly!==true||
    transport.runnerTransportAuthenticated!==true||
    transport.serverCertificateSpkiMatched!==true||
    transport.workerIdentitySignatureVerified!==true||
    transport.nonceBoundResponseVerified!==true||
    transport.dispatchAllowed!==false||transport.artifactProduced!==false||
    transport.runtimeImageAttested!==false||
    transport.manifestDigest!==plan.manifestDigest||
    transport.sourceSha!==m.sourceSha||transport.lockDigest!==m.lockDigest||
    transport.acceptanceId!==acceptance.id||
    transport.challengeId!==acceptance.challengeId||
    transport.workerId!==acceptance.workerId||
    transport.runId!==acceptance.runId)
  fail('Missing authenticated TEST runner transport receipt');
 if(!sdk||sdk.testOnly!==true||
    sdk.completeLocalTreeHashesMatched!==true||
    sdk.sdkTemplateBytesVerified!==true||
    sdk.dispatchAllowed!==false||sdk.artifactProduced!==false||
    sdk.manifestDigest!==plan.manifestDigest||
    sdk.sourceSha!==m.sourceSha||sdk.lockDigest!==m.lockDigest||
    sdk.workerId!==acceptance.workerId||sdk.runId!==acceptance.runId||
    !exact(sdk.verifiedTrees,NAMES)||
    NAMES.some(name=>!SHA.test(sdk.verifiedTrees[name]?.digest)))
  fail('Missing complete approved TEST SDK byte verification');
 if(!policy||policy.workerId!==acceptance.workerId||
    policy.runId!==acceptance.runId||
    policy.imageDigest!=='sha256:'+policy.imageDigest?.slice(7)||
    !IMAGE.test(policy.imageDigest))
  fail('Isolated Linux mount policy is not independently pinned');
 const [status,mountinfo]=await Promise.all([
  readFile('/proc/self/status','utf8'),
  readFile('/proc/self/mountinfo','utf8')
 ]);
 const result=evaluateTestAndroidLinuxIsolationSnapshot({
  status,mountinfo,uid:process.getuid(),gid:process.getgid()
 },policy);
 for(const name of NAMES){
  const path=policy.mounts[name].path;
  const stat=await lstat(path);
  if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(path)!==path)
   fail('SDK mount path changed or is symbolic: '+name);
 }
 return Object.freeze({
  schemaVersion:1,environment:'TEST',testOnly:true,workerId:acceptance.workerId,
  runId:acceptance.runId,manifestDigest:plan.manifestDigest,
  acceptanceId:acceptance.id,sourceSha:m.sourceSha,lockDigest:m.lockDigest,
  ...result,
  runnerTransportAuthenticated:true,
  sdkTemplateBytesVerified:true,
  artifactProduced:false,signerVerified:false,archiveVerified:false,
  requiresExternalImageAttestation:true,
  requiresImmutableExecutionAuthorization:true
 });
}
