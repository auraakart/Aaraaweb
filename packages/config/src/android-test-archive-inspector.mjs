import { createHash } from 'node:crypto';
import { open, lstat, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { TextDecoder } from 'node:util';
import { androidBuildManifestDigest } from './android-build-contract.mjs';

const SHA=/^[a-f0-9]{64}$/;
const ID=/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}$/;
const MAX_ARCHIVE=256*1024*1024,MAX_ENTRIES=12000,MAX_ENTRY=80*1024*1024;
const MAX_TOTAL=768*1024*1024,MAX_CENTRAL=24*1024*1024;
const utf8=new TextDecoder('utf-8',{fatal:true});
const fail=message=>{throw new Error(message);};
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 Object.getPrototypeOf(v)===Object.prototype&&
 Object.keys(v).sort().join(',')===keys.slice().sort().join(',');
const sha=b=>createHash('sha256').update(b).digest('hex');
const crcTable=Uint32Array.from({length:256},(_,i)=>{
 let x=i;for(let j=0;j<8;j++)x=(x&1)?0xedb88320^(x>>>1):x>>>1;
 return x>>>0;
});
const crc32=bytes=>{
 let crc=0xffffffff;
 for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);
 return (crc^0xffffffff)>>>0;
};
const validEntry=name=>typeof name==='string'&&name.length>0&&name.length<=255&&
 !name.startsWith('/')&&!name.includes('\\')&&!name.includes(':')&&
 !/[\u0000-\u001f\u007f]/.test(name)&&
 name.split('/').every((v,i,a)=>i===a.length-1&&v==='' ? name.endsWith('/') : v!==''&&v!=='.'&&v!=='..');
const required={
 APK:['AndroidManifest.xml','classes.dex','resources.arsc'],
 AAB:['BundleConfig.pb','base/manifest/AndroidManifest.xml','base/dex/classes.dex']
};
/**
 * Fully parse the classic ZIP32 central and local headers, limit decompression,
 * and CRC-verify *every* member in an untrusted TEST APK/AAB candidate.
 * This is only a byte/ZIP-structure check; Android binary manifest semantics,
 * APK Signing Block, certificates and package identity are NOT verified.
 */
export function verifyTestAndroidZip32Bytes(bytes,format){
 if(!Buffer.isBuffer(bytes)||bytes.length<22||bytes.length>MAX_ARCHIVE||
    !['APK','AAB'].includes(format))fail('Unsupported or oversized TEST Android archive');
 const e=bytes.length-22;
 if(bytes.readUInt32LE(e)!==0x06054b50||
    bytes.readUInt16LE(e+4)!==0||bytes.readUInt16LE(e+6)!==0||
    bytes.readUInt16LE(e+8)!==bytes.readUInt16LE(e+10)||
    bytes.readUInt16LE(e+20)!==0)
  fail('Ambiguous ZIP end record, multi-disk or trailing archive comment');
 const count=bytes.readUInt16LE(e+10),
  size=bytes.readUInt32LE(e+12),offset=bytes.readUInt32LE(e+16);
 if(count<required[format].length||count>MAX_ENTRIES||
    size>MAX_CENTRAL||offset>e||offset+size!==e||
    size===0xffffffff||offset===0xffffffff)
  fail('Unsafe or ZIP64 TEST archive central inventory');
 const names=new Set(),ranges=[];
 let position=offset,unpacked=0;
 for(let i=0;i<count;i++){
  if(position+46>e||bytes.readUInt32LE(position)!==0x02014b50)
   fail('Invalid central directory entry');
  const flags=bytes.readUInt16LE(position+8),method=bytes.readUInt16LE(position+10);
  const checksum=bytes.readUInt32LE(position+16),
   compressed=bytes.readUInt32LE(position+20),
   uncompressed=bytes.readUInt32LE(position+24);
  const nameLen=bytes.readUInt16LE(position+28),
   extraLen=bytes.readUInt16LE(position+30),
   commentLen=bytes.readUInt16LE(position+32),
   disk=bytes.readUInt16LE(position+34),
   external=bytes.readUInt32LE(position+38),
   local=bytes.readUInt32LE(position+42);
  const end=position+46+nameLen+extraLen+commentLen;
  if(end>e||nameLen<1||disk!==0||
     compressed===0xffffffff||uncompressed===0xffffffff||
     (flags&~(0x8|0x800))!==0||![0,8].includes(method)||
     compressed>MAX_ENTRY||uncompressed>MAX_ENTRY||local>=offset||
     ((external>>>16)&0xf000)===0xa000)
   fail('Unsupported, encrypted, linked or unbounded ZIP entry');
  let name;
  try{name=utf8.decode(bytes.subarray(position+46,position+46+nameLen));}
  catch{fail('Invalid UTF-8 archive filename');}
  if(!validEntry(name)||names.has(name))fail('Duplicate or traversing ZIP member');
  names.add(name);
  if(name.endsWith('/')&&(uncompressed!==0||compressed!==0))
   fail('Directory entry contains bytes');
  unpacked+=uncompressed;
  if(unpacked>MAX_TOTAL||
     (uncompressed>0&&compressed===0)||
     (compressed>0&&uncompressed/compressed>500))
   fail('TEST Android ZIP bomb or excess uncompressed bytes');
  if(local+30>offset||bytes.readUInt32LE(local)!==0x04034b50||
     bytes.readUInt16LE(local+6)!==flags||
     bytes.readUInt16LE(local+8)!==method)
   fail('Central and local ZIP header disagreement');
  const lnam=bytes.readUInt16LE(local+26),lextra=bytes.readUInt16LE(local+28);
  const start=local+30+lnam+lextra,endData=start+compressed;
  if(lnam!==nameLen||endData>offset||
     !bytes.subarray(local+30,local+30+lnam).equals(
       bytes.subarray(position+46,position+46+nameLen)))
   fail('Malformed or contradictory local ZIP entry');
  if(!(flags&0x8)&&(
     bytes.readUInt32LE(local+14)!==checksum||
     bytes.readUInt32LE(local+18)!==compressed||
     bytes.readUInt32LE(local+22)!==uncompressed))
   fail('Local ZIP member length or checksum mismatch');
  const data=bytes.subarray(start,endData);
  let expanded;
  try{
   expanded=method===0?data:inflateRawSync(data,{maxOutputLength:MAX_ENTRY+1});
  }catch{fail('Invalid or overexpanded compressed ZIP entry');}
  if(expanded.length!==uncompressed||crc32(expanded)!==checksum||
     (method===0&&compressed!==uncompressed))
   fail('ZIP file integrity or CRC mismatch');
  // A ZIP32 stream may put a 12/16-byte data descriptor after compressed
  // bytes. Account for it exactly; otherwise hidden data could pass the CRC
  // scanner without appearing in the central directory.
  let recordEnd=endData;
  if(flags&0x8){
   const signed=endData+4<=offset&&bytes.readUInt32LE(endData)===0x08074b50;
   const at=endData+(signed?4:0);
   if(at+12>offset||
      bytes.readUInt32LE(at)!==checksum||
      bytes.readUInt32LE(at+4)!==compressed||
      bytes.readUInt32LE(at+8)!==uncompressed)
    fail('ZIP data descriptor disagrees with central record');
   recordEnd=at+12;
  }
  ranges.push({start:local,end:recordEnd});
  position=end;
 }
 if(position!==e)fail('Hidden central ZIP records');
 ranges.sort((a,b)=>a.start-b.start);
 let cursor=0;
 for(const range of ranges){
  if(range.start!==cursor)
   fail('Unaccounted or overlapping ZIP local data');
  cursor=range.end;
 }
 // APK Signature Scheme v2/v3 adds an APK Signing Block between local ZIP
 // entries and the central directory. Check only its framing here; neither
 // its cryptographic validity nor signer certificate is verified.
 if(cursor!==offset){
  if(format!=='APK'||offset-cursor<32||
     offset-cursor>16*1024*1024)
   fail('Unaccounted bytes before ZIP central directory');
  const blockSize=BigInt(offset-cursor-8);
  if(bytes.readBigUInt64LE(cursor)!==blockSize||
     bytes.readBigUInt64LE(offset-24)!==blockSize||
     !bytes.subarray(offset-16,offset).equals(Buffer.from('APK Sig Block 42')))
   fail('Invalid APK Signing Block framing');
 }
 for(const filename of required[format])if(!names.has(filename))
  fail('Missing Android '+format+' structural member '+filename);
 if(format==='APK'&&names.has('base/manifest/AndroidManifest.xml')||
    format==='AAB'&&names.has('AndroidManifest.xml'))
  fail('Mixed APK/AAB archive layout');
 return Object.freeze({
  archiveFormat:format,centralDirectoryVerified:true,allMemberCrcsVerified:true,
  entryCount:count,uncompressedBytes:unpacked,
  requiredAndroidMembersFound:true,apkSigningBlockVerified:false,
  androidBinaryManifestVerified:false,signerVerified:false,
  packageIdentityVerified:false,artifactPublished:false,
  dispatchAllowed:false
 });
}
/** Bounded read-only inspection of one untrusted artifact candidate. */
export async function inspectTestAndroidCandidateArchive(plan,reservation,location){
 const m=plan?.manifest;
 if(!plan||plan.testOnly!==true||plan.dispatchAllowed!==false||
    plan.requiresVersionReservation!==true||!m||m.schemaVersion!==1||
    m.buildMode!=='TEST'||!['RESIDENT','GUARD'].includes(m.appRole)||
    !ID.test(m.applicationId)||m.namespace!==m.applicationId||
    plan.appDirectory!=='apps/'+m.appRole.toLowerCase()||
    plan.manifestDigest!==androidBuildManifestDigest(m)||
    !reservation||reservation.status!=='RESERVED_TEST_ONLY'||
    reservation.testOnly!==true||reservation.dispatchAllowed!==false||
    reservation.digest!==plan.manifestDigest||
    !Number.isSafeInteger(reservation.versionCode)||
    reservation.versionCode<1||reservation.versionCode>2100000000)
  fail('Untrusted non-dispatchable TEST Android archive context');
 if(!exact(location,['root','filename','format'])||
    !['APK','AAB'].includes(location.format)||
    typeof location.root!=='string'||!isAbsolute(location.root)||
    resolve(location.root)!==location.root||
    typeof location.filename!=='string'||
    location.filename!=='test-'+m.distributionId+'-'+m.appRole.toLowerCase()+
      '.'+location.format.toLowerCase())
  fail('Unapproved TEST Android artifact candidate location');
 const root=location.root;
 if(root==='/'||await realpath(root)!==root||
    !(await lstat(root)).isDirectory())
  fail('Noncanonical TEST artifact root');
 const path=join(root,location.filename);
 if(await realpath(path)!==path)fail('TEST artifact symlink or path alias');
 const before=await lstat(path);
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||
    (before.mode&0o022)||before.size<22||before.size>MAX_ARCHIVE)
  fail('Unsafe TEST Android artifact candidate file');
 const handle=await open(path,'r');
 let bytes;
 try{
  const hstat=await handle.stat();
  if(hstat.ino!==before.ino||hstat.dev!==before.dev||
     hstat.size!==before.size)fail('Android archive inode changed');
  bytes=await handle.readFile();
 }finally{await handle.close();}
 const after=await lstat(path);
 if(after.ino!==before.ino||after.dev!==before.dev||
    after.size!==before.size||after.mtimeMs!==before.mtimeMs||
    after.ctimeMs!==before.ctimeMs||after.mode!==before.mode)
  fail('Android artifact candidate changed during read');
 const structural=verifyTestAndroidZip32Bytes(bytes,location.format);
 return Object.freeze({
  schemaVersion:1,environment:'TEST',testOnly:true,
  distributionId:m.distributionId,appRole:m.appRole,
  applicationId:m.applicationId,versionCode:reservation.versionCode,
  reservationId:reservation.id,manifestDigest:plan.manifestDigest,
  sourceSha:m.sourceSha,lockDigest:m.lockDigest,
  sha256:sha(bytes),bytes:bytes.length,...structural,
  // Byte structure and ZIP member CRCs DO NOT imply valid Android signing.
  archiveVerified:false,signerVerified:false,
  androidPackageVersionVerified:false,artifactApproved:false,
  artifactPublished:false,dispatchAllowed:false,
  requiresIndependentAapt2AndApksignerOrBundletoolChecks:true,
  requiresCompletionAuthorityRecheck:true
 });
}
