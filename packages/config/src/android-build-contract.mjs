import { createHash } from 'node:crypto';
import { normalizePartnerDomainHostname } from './partner-domain-contract.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hex64=/^[0-9a-f]{64}$/;
const keys=['schemaVersion','distributionId','approvalId','partnerId','societyId','brandRevision','sourceSha','lockDigest','applicationId','namespace','appRole','label','buildMode','apiOrigin','configDigest','assetDigests','firebaseClientRef','appLinkHosts','signingProfile','signerFingerprint'];
const json=(v)=>JSON.stringify(v===null||typeof v!=='object'?v:Array.isArray(v)?v.map(x=>JSON.parse(json(x))):Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,JSON.parse(json(x))])));
export const androidBuildManifestDigest=(value)=>createHash('sha256').update(json(value)).digest('hex');
const fail=(message)=>{throw new Error(message);};
const equal=(a,b)=>json(a)===json(b);
function instant(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value))fail('Invalid build approval time');
 const date=new Date(value);if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,19)!==value.slice(0,19))fail('Invalid build approval time');
 return date.getTime();
}
function frozen(value){
 if(value&&typeof value==='object'){for(const v of Object.values(value))frozen(v);Object.freeze(value);}
 return value;
}
const identity=/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}$/;
const javaKeywords=new Set('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null _'.split(' '));

/** Pure TEST build planning, not a DB authority or a dispatch API. Caller must
 * provide independently reauthorized snapshots. Never consume arbitrary partner
 * config as this context, or use this result as a session/entitlement grant. */
export function planTestAndroidBuild(manifest,context){
 if(!manifest||typeof manifest!=='object'||Array.isArray(manifest)||Object.keys(manifest).length!==keys.length||Object.keys(manifest).some(k=>!keys.includes(k)))fail('Invalid Android build manifest shape');
 const m=manifest;
 if(m.schemaVersion!==1||m.buildMode!=='TEST'||!['RESIDENT','GUARD'].includes(m.appRole))fail('Only explicit TEST Android builds are supported');
 for(const k of ['distributionId','approvalId','partnerId','societyId'])if(typeof m[k]!=='string'||!uuid.test(m[k]))fail('Invalid build identity');
 if(!Number.isSafeInteger(m.brandRevision)||m.brandRevision<1||m.brandRevision>2147483647)fail('Invalid brand revision');
 if(typeof m.sourceSha!=='string'||!/^[0-9a-f]{40}$/.test(m.sourceSha)||!hex64.test(m.lockDigest)||!hex64.test(m.configDigest)||!hex64.test(m.signerFingerprint))fail('Invalid build digest or source revision');
 if(typeof m.applicationId!=='string'||m.applicationId.length>150||!identity.test(m.applicationId)||m.namespace!==m.applicationId||m.applicationId.split('.').some(p=>javaKeywords.has(p))||/^(com\.example|com\.aaraagate|in\.aaraagate|com\.aaraaweb|com\.aaraaplatforms)(\.|$)/.test(m.applicationId))fail('Invalid or reserved Android identity');
 if(typeof m.label!=='string'||m.label.trim()!==m.label||m.label.length<1||m.label.length>60||/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069<>]/.test(m.label))fail('Unsafe Android label');
 if(typeof m.signingProfile!=='string'||!/^TEST_[A-Z0-9_]{3,60}$/.test(m.signingProfile))fail('Invalid test signing profile');
 if(!m.assetDigests||typeof m.assetDigests!=='object'||Array.isArray(m.assetDigests)||Object.keys(m.assetDigests).length!==2||!Object.keys(m.assetDigests).every(k=>['icon','splash'].includes(k))||!hex64.test(m.assetDigests.icon)||!hex64.test(m.assetDigests.splash))fail('Invalid native asset digests');
 if(!Array.isArray(m.appLinkHosts)||m.appLinkHosts.length>5||new Set(m.appLinkHosts).size!==m.appLinkHosts.length)fail('Invalid app-link hosts');
 for(const host of m.appLinkHosts)if(normalizePartnerDomainHostname(host)!==host)fail('Noncanonical app-link host');
 let api;try{api=new URL(m.apiOrigin);}catch{fail('Invalid build API origin');}
 if(typeof m.apiOrigin!=='string'||api.protocol!=='https:'||api.origin!==m.apiOrigin)fail('Invalid build API origin');
 if(typeof m.firebaseClientRef!=='string'||!/^TEST_[A-Z0-9_]{3,60}$/.test(m.firebaseClientRef))fail('Invalid public test Firebase reference');
 if(!context||context.environment!=='TEST'||!Array.isArray(context.distributions)||context.distributions.length>50||!Array.isArray(context.apiOrigins)||context.apiOrigins.length>20||!context.apiOrigins.includes(m.apiOrigin))fail('Untrusted test build context');
 const matches=context.distributions.filter(d=>d?.id===m.distributionId);
 if(matches.length!==1)fail('Missing or ambiguous distribution approval');
 const d=matches[0],now=instant(context.now);
 if(d.status!=='APPROVED_TEST_INPUT'||d.revoked!==false||d.activeAllocation!==true||d.approvalId!==m.approvalId||d.partnerId!==m.partnerId||d.societyId!==m.societyId||d.partnerStatus!=='ACTIVE'||now<instant(d.startsAt)||now>=instant(d.endsAt)||instant(d.startsAt)>=instant(d.endsAt))fail('Distribution approval is stale or foreign');
 // Existing V5.4.20 approval fixes these initial identity/source/config fields.
 for(const k of ['applicationId','namespace','appRole','label','sourceSha','configDigest','apiOrigin','signingProfile'])if(d.approvedInputs?.[k]!==m[k])fail('Build differs from approved initial inputs');
 if(d.approvedInputs?.schemaVersion!==1||d.approvedInputs?.environment!=='TEST'||d.approvedDigest!==androidBuildManifestDigest(d.approvedInputs))fail('Invalid approved input digest');
 if(context.distributions.some(other=>other?.id!==d.id&&other?.approvedInputs?.applicationId===m.applicationId))fail('Android identity belongs to another distribution');
 if(context.sourceSha!==m.sourceSha||context.lockDigest!==m.lockDigest)fail('Checkout or lock digest mismatch');
 const brand=context.brand;
 if(!brand||brand.published!==true||brand.partnerId!==m.partnerId||brand.societyId!==m.societyId||brand.version!==m.brandRevision||brand.digest!==m.configDigest)fail('Unpublished or foreign brand revision');
 if(!Array.isArray(context.verifiedAssets)||context.verifiedAssets.length>10)fail('Missing verified assets');
 for(const role of ['icon','splash']){
  const found=context.verifiedAssets.filter(a=>a?.role===role&&a?.digest===m.assetDigests[role]);
  if(found.length!==1||found[0].partnerId!==m.partnerId||found[0].societyId!==m.societyId||found[0].brandRevision!==m.brandRevision||found[0].contentType!=='image/png'||found[0].metadataStripped!==true)fail('Unverified or foreign native asset');
 }
 if(!Array.isArray(context.signingProfiles)||context.signingProfiles.length>10)fail('Missing test signing profile');
 const profiles=context.signingProfiles.filter(p=>p?.id===m.signingProfile);
 if(profiles.length!==1||profiles[0].environment!=='TEST'||profiles[0].distributionId!==m.distributionId||profiles[0].fingerprint!==m.signerFingerprint)fail('Signing identity mismatch');
 if(!Array.isArray(context.firebaseClients)||context.firebaseClients.length>10)fail('Missing test Firebase mapping');
 const clients=context.firebaseClients.filter(c=>c?.id===m.firebaseClientRef);
 // This first contract permits push-disabled fixtures only. It must never
 // pretend a real Firebase client has been provisioned or use live credentials.
 if(clients.length!==1||clients[0].distributionId!==m.distributionId||clients[0].applicationId!==m.applicationId||clients[0].pushEnabled!==false||clients[0].environment!=='TEST')fail('Unapproved test Firebase mapping');
 if(!Array.isArray(context.verifiedAppLinks)||context.verifiedAppLinks.length>10)fail('Missing verified app-link registry');
 for(const hostname of m.appLinkHosts){
  const hosts=context.verifiedAppLinks.filter(h=>h?.hostname===hostname);
  if(hosts.length!==1||hosts[0].partnerId!==m.partnerId||hosts[0].societyId!==m.societyId||hosts[0].verified!==true||now>=instant(hosts[0].verifiedUntil))fail('Unverified or foreign app-link host');
 }
 // JSON clone avoids freezing/mutating caller-owned inputs. No paths or shell
 // fragments are accepted; artifact labels are derived from checked UUIDs.
 const checked=JSON.parse(json(m));
 return frozen({manifest:checked,manifestDigest:androidBuildManifestDigest(checked),appDirectory:m.appRole==='RESIDENT'?'apps/resident':'apps/guard',artifactPrefix:`test-${m.distributionId}-${m.appRole.toLowerCase()}`,testOnly:true,dispatchAllowed:false,requiresVersionReservation:true});
}

/** Check native bytes against the already verified asset snapshot. This is not
 * an image decoder or sanitizer; that separately trusted pipeline is required. */
export function checkAndroidAssetBytes(expectedDigest,bytes){
 if(!hex64.test(expectedDigest)||!(bytes instanceof Uint8Array)||bytes.length<24||bytes.length>2*1024*1024||createHash('sha256').update(bytes).digest('hex')!==expectedDigest)fail('Native asset bytes differ from approved digest');
 return true;
}

/** Provenance cannot turn unverified build output into approved evidence.
 * Exact version reservation and signer are inputs from the trusted allocator
 * and archive/signature verifier, neither of which this pure module implements. */
export function recordTestAndroidProvenance(plan,evidence){
 if(!plan||!plan.testOnly||plan.dispatchAllowed!==false||!equal(plan.manifestDigest,androidBuildManifestDigest(plan.manifest)))fail('Invalid build plan');
 const e=evidence;
 if(!e||typeof e!=='object'||Array.isArray(e)||Object.keys(e).sort().join(',')!=='applicationId,archiveVerified,artifacts,demoFixturesPresent,distributionId,lockDigest,manifestDigest,reservationConsumed,signerFingerprint,sourceSha,testSigned,toolchain,versionCode'||e.sourceSha!==plan.manifest.sourceSha||e.manifestDigest!==plan.manifestDigest||e.lockDigest!==plan.manifest.lockDigest||e.applicationId!==plan.manifest.applicationId||e.signerFingerprint!==plan.manifest.signerFingerprint||e.distributionId!==plan.manifest.distributionId||!Number.isSafeInteger(e.versionCode)||e.versionCode<1||e.versionCode>2100000000||e.reservationConsumed!==true||e.archiveVerified!==true||e.demoFixturesPresent!==false||e.testSigned!==true)fail('Invalid test artifact evidence');
 if(!e.toolchain||Object.keys(e.toolchain).sort().join(',')!=='flutter,java,node,pnpm'||Object.values(e.toolchain).some(v=>typeof v!=='string'||!/^\d+(?:\.\d+){0,2}$/.test(v)))fail('Invalid toolchain evidence');
 if(e.toolchain.flutter!=='3.47.0'||e.toolchain.java!=='17'||!/^22\./.test(e.toolchain.node)||e.toolchain.pnpm!=='10.15.0')fail('Unpinned build toolchain');
 if(!Array.isArray(e.artifacts)||e.artifacts.length!==2||new Set(e.artifacts.map(a=>a?.kind)).size!==2||e.artifacts.some(a=>!a||Object.keys(a).sort().join(',')!=='bytes,kind,sha256'||!['APK','AAB'].includes(a.kind)||!hex64.test(a.sha256)||!Number.isSafeInteger(a.bytes)||a.bytes<1))fail('Missing verified APK/AAB artifacts');
 return frozen({schemaVersion:1,...JSON.parse(json(e)),manifest:JSON.parse(json(plan.manifest)),buildMode:'TEST',testOnly:true,published:false});
}
