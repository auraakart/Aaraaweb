import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { deflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { PrismaMembershipRepository } from '../auth/prisma-membership.repository';
import { BrandLogoService } from './brand-logo.service';

const society = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const actor = '33333333-3333-4333-8333-333333333333';
const id = '44444444-4444-4444-8444-444444444444';

function crc32(data: Buffer) {
  let result = 0xffffffff;
  for (const octet of data) {
    result ^= octet;
    for (let i=0; i<8; i++) result=(result>>>1)^((result&1)?0xedb88320:0);
  }
  return (result^0xffffffff)>>>0;
}
function part(name: string, data: Buffer) {
  const length=Buffer.alloc(4), crc=Buffer.alloc(4), text=Buffer.concat([Buffer.from(name),data]);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(text));
  return Buffer.concat([length,text,crc]);
}
function png() {
  const h=Buffer.alloc(13); h.writeUInt32BE(64); h.writeUInt32BE(64,4); h[8]=8; h[9]=6;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    part('IHDR',h),part('IDAT',deflateSync(Buffer.alloc(64*(64*4+1)))),
    part('IEND',Buffer.alloc(0)),
  ]);
}
function setup(role: AppRole|null=AppRole.SOCIETY_ADMIN) {
  const bytes=png();
  const asset={
    id, societyId:society,createdById:actor,storageKey:'societies/'+society+'/branding/logos/verified.png',
    contentType:'image/png',contentLengthBytes:bytes.byteLength,
    status:'PENDING',sha256:null,createdAt:new Date(),verifiedAt:null,
    uploadExpiresAt:new Date(Date.now()-120000),
  };
  const tx={
    societyMembership:{findMany:vi.fn().mockResolvedValue(role?[{userId:actor,societyId:society,role,active:true}]:[])},
    society:{findFirst:vi.fn().mockResolvedValue({id:society})},
    societyBrandLogoAsset:{
      findMany:vi.fn().mockResolvedValue([asset]),findFirst:vi.fn().mockResolvedValue(asset),
      count:vi.fn().mockResolvedValue(0),create:vi.fn().mockResolvedValue(asset),
      updateMany:vi.fn().mockResolvedValue({count:1}),
    },
    $queryRaw:vi.fn().mockResolvedValue([{id:society}]),
  };
  const prisma={withTenantContext:vi.fn(async (_society: string, callback: (db: typeof tx)=>Promise<unknown>)=>callback(tx))};
  const storage={
    createUploadIntent:vi.fn().mockResolvedValue({
      storageKey:'private',method:'PUT',uploadUrl:'https://private.invalid/signed',
      headers:{'Content-Type':'image/png'},publicUrl:null,expiresAt:new Date(Date.now()+300000).toISOString(),
    }),
    headObject:vi.fn().mockResolvedValue({contentType:'image/png',contentLengthBytes:bytes.byteLength}),
    getObjectBytes:vi.fn().mockResolvedValue(bytes),deleteObject:vi.fn(),createDownloadIntent:vi.fn(),
  };
  const scanner={scanObject:vi.fn().mockResolvedValue({status:'CLEAN'})};
  const service=new BrandLogoService(prisma as never,
    new PrismaMembershipRepository(prisma as never),storage,scanner);
  return {service,asset,tx,storage,scanner,prisma,bytes};
}

describe('V5.3.12 private society logo security boundary', () => {
  it('rejects unsafe content types and size before the storage adapter is called', async () => {
    const {service,storage}=setup();
    await expect(service.createUpload(society,actor,{contentType:'image/svg+xml',contentLengthBytes:200}))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createUpload(society,actor,{contentType:'image/png',contentLengthBytes:700000}))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(storage.createUploadIntent).not.toHaveBeenCalled();
  });

  it('requires an active society configuration manager and rejects foreign or revoked membership', async () => {
    for (const role of [null,AppRole.TENANT,AppRole.AUDITOR]) {
      const {service,storage}=setup(role);
      await expect(service.createUpload(society,actor,{contentType:'image/png',contentLengthBytes:200}))
        .rejects.toBeInstanceOf(ForbiddenException);
      expect(storage.createUploadIntent).not.toHaveBeenCalled();
    }
  });

  it('limits pending uploads and refuses public object storage', async () => {
    const {service,tx,storage}=setup();
    tx.societyBrandLogoAsset.count.mockResolvedValue(4);
    await expect(service.createUpload(society,actor,{contentType:'image/png',contentLengthBytes:200}))
      .rejects.toBeInstanceOf(ConflictException);
    tx.societyBrandLogoAsset.count.mockResolvedValue(0);
    storage.createUploadIntent.mockResolvedValueOnce({
      storageKey:'bad',method:'PUT',uploadUrl:'https://public.invalid',
      publicUrl:'https://public.invalid',headers:{},expiresAt:new Date().toISOString(),
    });
    await expect(service.createUpload(society,actor,{contentType:'image/png',contentLengthBytes:200}))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.societyBrandLogoAsset.create).not.toHaveBeenCalled();
  });

  it('issues only a private short-lived upload intent and scoped redacted metadata', async () => {
    const {service,storage}=setup();
    const result=await service.createUpload(society,actor,{contentType:'image/png',contentLengthBytes:200});
    expect(result.upload.method).toBe('PUT');
    expect(result.asset).not.toHaveProperty('storageKey');
    expect(storage.createUploadIntent.mock.calls[0][0].storageKey)
      .toMatch(/^societies\/11111111-1111-4111-8111-111111111111\/branding\/logos\//);
    const list=await service.list(society,actor);
    expect(list[0]).not.toHaveProperty('storageKey');
  });

  it('fails closed when the upload belongs elsewhere or its signed PUT is still active', async () => {
    const {service,tx,asset}=setup();
    tx.societyBrandLogoAsset.findFirst.mockResolvedValueOnce(null);
    await expect(service.confirmUpload(other,actor,id)).rejects.toBeInstanceOf(NotFoundException);
    tx.societyBrandLogoAsset.findFirst.mockResolvedValue({...asset,uploadExpiresAt:new Date(Date.now()+300000)});
    await expect(service.confirmUpload(society,actor,id)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects MIME-spoofed objects before scanning and never exposes their bytes', async () => {
    const {service,storage,scanner,tx}=setup();
    storage.headObject.mockResolvedValue({contentType:'text/html',contentLengthBytes:123});
    await expect(service.confirmUpload(society,actor,id)).rejects.toBeInstanceOf(BadRequestException);
    expect(scanner.scanObject).not.toHaveBeenCalled();
    expect(tx.societyBrandLogoAsset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({data:{status:'REJECTED'}}));
  });

  it('marks a safe static PNG verified only after CLEAN scanner result', async () => {
    const {service,tx,scanner,asset}=setup();
    tx.societyBrandLogoAsset.findFirst.mockResolvedValueOnce(asset).mockResolvedValueOnce({
      ...asset,status:'VERIFIED',sha256:'f'.repeat(64),verifiedAt:new Date(),
    });
    const result=await service.confirmUpload(society,actor,id);
    expect(result.status).toBe('VERIFIED');
    expect(scanner.scanObject).toHaveBeenCalledOnce();
    expect(tx.societyBrandLogoAsset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({data:expect.objectContaining({status:'VERIFIED',sha256:expect.stringMatching(/^[a-f0-9]{64}$/)})}));
  });

  it('never verifies an upload when malware scanner is unavailable', async () => {
    const {service,scanner,tx}=setup();
    scanner.scanObject.mockRejectedValue(new Error('scanner offline'));
    await expect(service.confirmUpload(society,actor,id)).rejects.toThrow('scanner offline');
    expect(tx.societyBrandLogoAsset.updateMany).not.toHaveBeenCalled();
  });
});

it('supports cancellation recovery but never cancels verified logo evidence',async()=>{
 const f=setup();
 await expect(f.service.cancelUpload(society,actor,id)).resolves.toMatchObject({status:'REJECTED'});
 expect(f.tx.societyBrandLogoAsset.updateMany).toHaveBeenCalledWith({where:{id,societyId:society,status:'PENDING'},data:{status:'REJECTED'}});
 f.tx.societyBrandLogoAsset.findFirst.mockResolvedValue({...f.asset,status:'VERIFIED'} as never);
 await expect(f.service.cancelUpload(society,actor,id)).rejects.toThrow(/verified/);
});
it('releases abandoned upload quota only after the full confirmation grace',async()=>{
 const f=setup();
 await f.service.createUpload(society,actor,{contentType:'image/png',contentLengthBytes:200});
 const cleanup=f.tx.societyBrandLogoAsset.updateMany.mock.calls[0][0];
 expect(cleanup.where.status).toBe('PENDING');
 expect(cleanup.where.uploadExpiresAt.lt.getTime()).toBeLessThanOrEqual(Date.now()-86400000);
});
