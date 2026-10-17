import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realpath, lstat, readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { androidBuildManifestDigest } from './android-build-contract.mjs';

const exec = promisify(execFile);
const sha40 = /^[a-f0-9]{40}$/;
const sha64 = /^[a-f0-9]{64}$/;
const fail = message => { throw new Error(message); };

// Source checkout is supplied by an independently authenticated, isolated
// worker, NOT by a partner/API request. This performs verification only:
// it neither fetches code nor proves worker identity or toolchain trust.
export async function verifyPinnedTestAndroidCheckout(plan, pin) {
 const m = plan?.manifest;
 if(!plan || plan.testOnly !== true || plan.dispatchAllowed !== false ||
    plan.requiresVersionReservation !== true || !m ||
    m.buildMode !== 'TEST' || !['RESIDENT','GUARD'].includes(m.appRole) ||
    plan.appDirectory !== 'apps/' + m.appRole.toLowerCase() ||
    plan.manifestDigest !== androidBuildManifestDigest(m) ||
    !sha40.test(m.sourceSha) || !sha64.test(m.lockDigest))
  fail('Invalid non-dispatchable Android TEST plan');
 if(!pin || typeof pin !== 'object' || Array.isArray(pin) ||
    Object.keys(pin).sort().join(',') !== 'checkoutRoot,pinnedLockDigest,pinnedSourceSha' ||
    !sha40.test(pin.pinnedSourceSha) || !sha64.test(pin.pinnedLockDigest) ||
    pin.pinnedSourceSha !== m.sourceSha || pin.pinnedLockDigest !== m.lockDigest ||
    typeof pin.checkoutRoot !== 'string' || !isAbsolute(pin.checkoutRoot))
  fail('Missing independently pinned TEST checkout identity');

 // Check this on the trusted worker before applying the previously staged
 // native resource files. Never run shell commands or use caller arguments as
 // executable command text. The worker must separately authenticate itself.
 const root = resolve(pin.checkoutRoot);
 const canonical = await realpath(root);
 if(canonical !== root) fail('TEST checkout root must not be a symlink');
 const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
 Object.assign(env, { GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:'/dev/null',
  GIT_OPTIONAL_LOCKS:'0', GIT_TERMINAL_PROMPT:'0', GIT_NO_REPLACE_OBJECTS:'1' });
 const git = async (...args) => {
  const {stdout} = await exec('git',['-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null',
   '-C',root,...args],{env,timeout:5000,maxBuffer:65536,windowsHide:true});
  return stdout.trim();
 };
 if((await git('rev-parse','--show-toplevel')) !== root ||
    (await git('rev-parse','--is-inside-work-tree')) !== 'true')
  fail('TEST checkout is not the verified repository root');
 const head = await git('rev-parse','--verify','HEAD');
 if(!sha40.test(head) || head !== pin.pinnedSourceSha)
  fail('TEST checkout HEAD is not the approved source revision');
 if(await git('status','--porcelain=v1','--untracked-files=all'))
  fail('TEST checkout is dirty or contains untracked files');
 const lockPath = join(root,'pnpm-lock.yaml');
 const info = await lstat(lockPath);
 if(!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > 20*1024*1024)
  fail('TEST dependency lock must be a bounded regular file');
 const bytes = await readFile(lockPath);
 const digest = createHash('sha256').update(bytes).digest('hex');
 if(digest !== pin.pinnedLockDigest) fail('TEST dependency lock digest differs from approved source');
 return Object.freeze({
  schemaVersion:1,environment:'TEST',testOnly:true,
  sourceSha:head,lockDigest:digest,appRole:m.appRole,appDirectory:plan.appDirectory,
  manifestDigest:plan.manifestDigest,checkoutClean:true,checkoutVerified:true,
  runnerAuthenticated:false,toolchainVerified:false,nativeWrapperVerified:false,
  signerVerified:false,artifactProduced:false,dispatchAllowed:false,
  requiresAuthenticatedRunner:true,requiresCompletionRecheck:true
 });
}
