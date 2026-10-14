import { createHash } from 'node:crypto';
import { androidBuildManifestDigest } from './android-build-contract.mjs';
import { normalizePartnerDomainHostname } from './partner-domain-contract.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const PACKAGE=/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}$/;
const SHA=/^[a-f0-9]{64}$/;
const ROLES=['RESIDENT','GUARD'];
const fail=m=>{throw new Error(m);};
const providerNames=id=>[
 id+'.fileprovider',id+'.firebaseinitprovider',id+'.flutter_share_provider'
];
/**
 * TEST-only, PURE planned co-installation preflight for Resident & Guard app
 * pairs across one or more separately branded partner/society scopes.
 * Input plans must already originate from *independently* reviewed TEST
 * distribution authority. This does not install anything, inspect APK
 * manifests or prove real signer certificates.
 */
export function evaluateTestAndroidCoInstallationPlans(plans){
 if(!Array.isArray(plans)||plans.length<2||plans.length>20||plans.length%2!==0)
  fail('Need bounded complete Resident/Guard TEST app pairs');
 const scopes=new Map(),apps=new Map(),authorities=new Map(),links=new Map();
 const signers=new Map(),profiles=new Map(),distributions=new Set();
 const records=[];
 for(const p of plans){
  const m=p?.manifest;
  if(!p||p.testOnly!==true||p.dispatchAllowed!==false||
     p.requiresVersionReservation!==true||!m||
     m.schemaVersion!==1||m.buildMode!=='TEST'||
     !ROLES.includes(m.appRole)||
     p.appDirectory!=='apps/'+m.appRole.toLowerCase()||
     p.manifestDigest!==androidBuildManifestDigest(m)||
     !UUID.test(m.partnerId)||!UUID.test(m.societyId)||
     !UUID.test(m.distributionId)||distributions.has(m.distributionId)||
     !PACKAGE.test(m.applicationId)||m.applicationId!==m.namespace||
     /^(com\.example|com\.aaraagate|in\.aaraagate|com\.aaraaweb|com\.aaraaplatforms)(\.|$)/.test(m.applicationId)||
     !SHA.test(m.signerFingerprint)||!SHA.test(m.configDigest)||
     !/^TEST_[A-Z0-9_]{3,60}$/.test(m.signingProfile)||
     p.artifactPrefix!=='test-'+m.distributionId+'-'+m.appRole.toLowerCase()||
     !Array.isArray(m.appLinkHosts)||m.appLinkHosts.length>5||
     new Set(m.appLinkHosts).size!==m.appLinkHosts.length)
   fail('Unapproved TEST Android co-installation plan');
  const scope=m.partnerId+'|'+m.societyId;
  const roles=scopes.get(scope)||new Map();
  if(roles.has(m.appRole))
   fail('Two Android apps compete for the same partner/society role');
  roles.set(m.appRole,m.applicationId);
  scopes.set(scope,roles);
  distributions.add(m.distributionId);
  if(apps.has(m.applicationId))
   fail('Android package name reused across independently approved apps');
  apps.set(m.applicationId,{scope,role:m.appRole});
  // Android provider authorities are global on an Android device, not
  // per-application. Validate against app IDs after collecting all plans.
  for(const authority of providerNames(m.applicationId)){
   if(authorities.has(authority))
    fail('Android content-provider namespace collision');
   authorities.set(authority,m.applicationId);
  }
  for(const host of m.appLinkHosts){
   if(typeof host!=='string'||normalizePartnerDomainHostname(host)!==host||
      links.has(host))
    fail('Conflicting Android App Links would create a chooser/ownership collision');
   links.set(host,m.applicationId);
  }
  const otherSigner=signers.get(m.signerFingerprint);
  if(otherSigner&&otherSigner!==m.partnerId)
   fail('Two independent partner scopes reuse the same TEST signing identity');
  signers.set(m.signerFingerprint,m.partnerId);
  const otherProfile=profiles.get(m.signingProfile);
  if(otherProfile&&otherProfile!==m.partnerId)
   fail('Cross-partner signing profile reference collision');
  profiles.set(m.signingProfile,m.partnerId);
  records.push({
   partnerId:m.partnerId,societyId:m.societyId,
   distributionId:m.distributionId,appRole:m.appRole,
   applicationId:m.applicationId,signerFingerprint:m.signerFingerprint,
   appLinkHosts:[...m.appLinkHosts].sort(),
   manifestDigest:p.manifestDigest
  });
 }
 for(const [scope,roles] of scopes){
  if(roles.size!==2||ROLES.some(role=>!roles.has(role)))
   fail('Missing complete Resident/Guard TEST app pair for '+scope);
 }
 for(const [authority,owner] of authorities){
  if(apps.has(authority)&&authority!==owner)
   fail('Approved package name conflicts with another app provider authority');
 }
 records.sort((a,b)=>a.partnerId.localeCompare(b.partnerId)||
  a.societyId.localeCompare(b.societyId)||
  a.appRole.localeCompare(b.appRole));
 const matrixDigest=createHash('sha256').update(
  'aaraagate:v5.5.24:test-install-plans:v1\n'+JSON.stringify(records)
 ).digest('hex');
 return Object.freeze({
  schemaVersion:1,environment:'TEST',testOnly:true,
  appCount:records.length,scopeCount:scopes.size,
  distinctPackagesVerified:true,derivedProviderNamespacesDistinct:true,
  appLinkFilterHostsDistinct:true,crossPartnerTestSignerReferencesDistinct:true,
  pairedRolesVerified:true,plannedIsolationDigest:matrixDigest,
  // Plan-only checks are not a real APK inspection or install test.
  certificateVerified:false,installedPackageManagerQueried:false,
  realDeviceCoInstallationVerified:false,artifactProduced:false,
  buildExecutionAuthorized:false,dispatchAllowed:false,
  requiresIndependentManifestAndCertificateInspection:true,
  requiresRealDeviceInstallationRegression:true
 });
}
