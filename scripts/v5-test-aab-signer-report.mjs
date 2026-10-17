import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseTestAabJarSignerReports} from '../packages/config/src/android-test-aab-signing.mjs';
// A base debug certificate is only observed locally; not independently pinned.
export function parseBaseTestAabSignerReports(verification,certificate){
 if(typeof certificate!=='string'||certificate.length>128*1024)throw Error('Invalid local certificate report');
 const matches=[...certificate.matchAll(/^\s*SHA256:\s*((?:[0-9a-fA-F]{2}:){31}[0-9a-fA-F]{2})\s*$/gm)];
 if(matches.length!==1)throw Error('Ambiguous local leaf certificate');
 const fingerprint=matches[0][1].replaceAll(':','').toLowerCase();
 const parsed=parseTestAabJarSignerReports(verification,certificate,fingerprint);
 if(parsed.jarSignatureReportedVerified!==true||parsed.criticalMembersReportedSigned!==true||
    parsed.approvedSignerCountReported!==1||parsed.dispatchAllowed!==false)
  throw Error('Invalid local TEST AAB signature report');
 return Object.freeze({
  testOnly:true,locallyVerifiedJarSignature:true,observedSignerCount:1,
  observedLeafSha256:fingerprint,locallySignedCriticalMembers:true,
  independentlyAttestedRunner:false,partnerSignerPinned:false,
  partnerManifestBound:false,artifactApproved:false,
  artifactPublished:false,dispatchAllowed:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==4)throw Error('Require jarsigner and keytool report filenames');
  process.stdout.write(JSON.stringify(parseBaseTestAabSignerReports(
   readFileSync(process.argv[2],'utf8'),readFileSync(process.argv[3],'utf8')),null,2)+'\n');
 }catch(e){console.error('Invalid TEST AAB signing report: '+e.message);process.exitCode=1;}
}
