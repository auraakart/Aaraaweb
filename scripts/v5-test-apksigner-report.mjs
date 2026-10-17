import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Build Tools 37 emits "V2 Signer:", older releases "Signer #1".
// This validates LOCAL debug APK tool output, not attested partner signing.
export function parseTestAndroidSignerReport(text){
 if(typeof text!=='string'||text.length<100||text.length>65536||
   /(?:^|\n)\s*(?:error:|warning:|exception:)/im.test(text))
  throw new Error('Untrusted TEST signer report');
 const one=(pattern,label)=>{
  const list=[...text.matchAll(pattern)];
  if(list.length!==1)throw new Error('Missing or ambiguous '+label);
  return list[0][1];
 };
 if(one(/^Verified using v2 scheme \(APK Signature Scheme v2\): (true|false)$/gm,'v2 scheme')!=='true')
  throw new Error('TEST APK v2 signature is not verified');
 if(one(/^Number of signers: ([0-9]+)$/gm,'signer count')!=='1')
  throw new Error('TEST APK must have exactly one signer');
 const certificate=one(/^(?:V2 Signer:|Signer #1) certificate SHA-256 digest: ([0-9a-fA-F]{64})$/gm,
  'certificate SHA-256 digest').toLowerCase();
 return Object.freeze({localV2SignatureVerified:true,signerCount:1,
  certificateSha256:certificate,runnerAttested:false,
  partnerSignerApproved:false,dispatchAllowed:false,artifactPublished:false});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==3)throw new Error('Expected one signer report filename');
  process.stdout.write(JSON.stringify(parseTestAndroidSignerReport(readFileSync(process.argv[2],'utf8')),null,2)+'\n');
 }catch(e){console.error('Invalid TEST APK signer report: '+e.message);process.exitCode=1;}
}
