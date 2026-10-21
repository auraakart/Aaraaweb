import { afterEach, describe, expect, it, vi } from 'vitest';
import { deflateSync } from 'node:zlib';
import { HelpdeskPhotosService } from './helpdesk-photos.service';
import { validateStaticPng } from '../branding/society-logo-validation';
function png(){
 const chunk=(type:string,data:Buffer)=>{const body=Buffer.concat([Buffer.from(type),data]);let crc=0xffffffff;for(const byte of body){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}const n=Buffer.alloc(4),c=Buffer.alloc(4);n.writeUInt32BE(data.length);c.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([n,body,c])};
 const h=Buffer.alloc(13);h.writeUInt32BE(1,0);h.writeUInt32BE(1,4);h[8]=8;h[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',deflateSync(Buffer.alloc(5))),chunk('IEND',Buffer.alloc(0))]);
}
function setup(){
 const bytes=png();const row={id:'photo',ticketId:'ticket',kind:'BEFORE',note:'',sha256:validateStaticPng(bytes,{minDimension:1,maxDimension:1024,maxBytes:2097152}).sha256,sizeBytes:bytes.length,storageKey:'private/key',createdAt:new Date()};
 const tx={$queryRaw:vi.fn().mockResolvedValue([{id:'ticket',status:'OPEN'}]),$executeRaw:vi.fn(),helpdeskPhoto:{findUnique:vi.fn().mockResolvedValue(null),findFirst:vi.fn().mockResolvedValue(row),findMany:vi.fn().mockResolvedValue([]),count:vi.fn().mockResolvedValue(0),create:vi.fn().mockImplementation(async({data})=>({...row,...data}))}};
 const prisma={withTenantContext:vi.fn(async(_s,fn)=>fn(tx)),helpdeskPhoto:{findUnique:vi.fn().mockResolvedValue(null)}};
 const storage={createUploadIntent:vi.fn().mockResolvedValue({uploadUrl:'https://private.example/upload',publicUrl:null,headers:{},method:'PUT'}),getObjectBytes:vi.fn().mockResolvedValue(bytes),deleteObject:vi.fn().mockResolvedValue(undefined)};
 const scanner={scanObject:vi.fn().mockResolvedValue({status:'CLEAN'})};
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true}));
 return {service:new HelpdeskPhotosService(prisma as never,storage as never,scanner),tx,prisma,storage,scanner,bytes,row};
}
const input={kind:'BEFORE' as const,idempotencyKey:'retry-key'};
afterEach(()=>vi.unstubAllGlobals());
describe('V5.7 private complaint evidence',()=>{
 it('accepts metadata-free PNG and never exposes storage authority',async()=>{const x=setup();const result=await x.service.add('society','resident','ticket',input,x.bytes);expect(result).toMatchObject({kind:'BEFORE',sizeBytes:x.bytes.length});expect(result).not.toHaveProperty('storageKey');expect(result).not.toHaveProperty('uploadUrl');expect(x.storage.deleteObject).not.toHaveBeenCalled();expect(x.tx.$executeRaw).toHaveBeenCalledOnce();expect(x.prisma.withTenantContext).toHaveBeenCalledTimes(2)});
 it('rejects malformed content and foreign ownership before creating an object',async()=>{const x=setup();await expect(x.service.add('society','resident','ticket',input,Buffer.from('fake'))).rejects.toThrow('static PNG');x.tx.$queryRaw.mockResolvedValue([]);await expect(x.service.add('society','resident','ticket',input,x.bytes)).rejects.toThrow('not found');expect(x.storage.createUploadIntent).not.toHaveBeenCalled()});
 it('returns an exact retry even after closure, but refuses changed content',async()=>{const x=setup();x.tx.$queryRaw.mockResolvedValue([{id:'ticket',status:'CLOSED'}]);x.tx.helpdeskPhoto.findUnique.mockResolvedValue(x.row);await expect(x.service.add('society','resident','ticket',input,x.bytes)).resolves.toMatchObject({id:'photo'});await expect(x.service.add('society','resident','ticket',{...input,note:'changed'},x.bytes)).rejects.toThrow('different submission');expect(x.storage.createUploadIntent).not.toHaveBeenCalled()});
 it('enforces the quota before storage and again under the ticket lock',async()=>{const x=setup();x.tx.helpdeskPhoto.count.mockResolvedValue(6);await expect(x.service.add('society','resident','ticket',input,x.bytes)).rejects.toThrow('six photos');expect(x.storage.createUploadIntent).not.toHaveBeenCalled();x.tx.helpdeskPhoto.count.mockReset().mockResolvedValueOnce(0).mockResolvedValueOnce(6);await expect(x.service.add('society','resident','ticket',input,x.bytes)).rejects.toThrow('six photos');expect(x.tx.helpdeskPhoto.create).not.toHaveBeenCalled();expect(x.storage.deleteObject).toHaveBeenCalledOnce()});
 it('cleans unlinked infected or changed objects',async()=>{const x=setup();x.scanner.scanObject.mockResolvedValue({status:'INFECTED'});await expect(x.service.add('society','resident','ticket',input,x.bytes)).rejects.toThrow('safety scanning');expect(x.storage.deleteObject).toHaveBeenCalledOnce();expect(x.tx.helpdeskPhoto.create).not.toHaveBeenCalled()});
 it('refuses public upload locations',async()=>{const x=setup();x.storage.createUploadIntent.mockResolvedValue({uploadUrl:'https://public.example/upload',publicUrl:'https://public.example/photo',headers:{},method:'PUT'});await expect(x.service.add('society','resident','ticket',input,x.bytes)).rejects.toThrow('Private photo storage');expect(fetch).not.toHaveBeenCalled()});
 it('rechecks current occupancy after reading private bytes',async()=>{const x=setup();x.tx.$queryRaw.mockResolvedValueOnce([{id:'ticket',status:'OPEN'}]).mockResolvedValueOnce([]);await expect(x.service.read('society','resident','ticket','photo')).rejects.toThrow('not found');expect(x.storage.getObjectBytes).toHaveBeenCalledOnce()});
 it('keeps possibly committed evidence when the acknowledgement is lost',async()=>{const x=setup();x.tx.helpdeskPhoto.create.mockRejectedValue(new Error('lost acknowledgement'));x.prisma.helpdeskPhoto.findUnique.mockRejectedValue(new Error('DB unavailable'));await expect(x.service.add('society','resident','ticket',input,x.bytes)).rejects.toThrow('lost acknowledgement');expect(x.storage.deleteObject).not.toHaveBeenCalled()});
});
