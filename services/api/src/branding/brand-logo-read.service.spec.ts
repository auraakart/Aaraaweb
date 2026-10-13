import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { PrismaMembershipRepository } from '../auth/prisma-membership.repository';
import { societyBrandDigest } from './branding-contract';
import { PublishedBrandLogoService } from './brand-logo-read.service';

const societyId = '11111111-1111-4111-8111-111111111111';
const otherSociety = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const assetId = '44444444-4444-4444-8444-444444444444';
const principal = { userId, societyId, roles: [AppRole.TENANT] };

function crc32(data: Buffer) {
  let value = 0xffffffff;
  for (const byte of data) {
    value ^= byte;
    for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type: string, payload: Buffer) {
  const size = Buffer.alloc(4), checksum = Buffer.alloc(4);
  size.writeUInt32BE(payload.length);
  const body = Buffer.concat([Buffer.from(type), payload]);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([size, body, checksum]);
}
function png() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(64); header.writeUInt32BE(64, 4);
  header[8] = 8; header[9] = 6;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',header),
    chunk('IDAT',deflateSync(Buffer.alloc(64 * (1 + 64 * 4)))),
    chunk('IEND',Buffer.alloc(0)),
  ]);
}

function setup() {
  const bytes=png();
  const config={displayName:'Verified society',logoAssetId:assetId};
  const asset={
    storageKey:'societies/'+societyId+'/branding/logos/'+assetId+'.png',
    status:'VERIFIED',sha256:createHash('sha256').update(bytes).digest('hex'),
    contentType:'image/png',contentLengthBytes:bytes.length,
    uploadExpiresAt:new Date(Date.now()-300000),
  };
  const tx={
    societyMembership:{findMany:vi.fn().mockResolvedValue([{
      societyId,userId,role:AppRole.TENANT,active:true,
    }])},
    $queryRaw:vi.fn().mockResolvedValue([]),
    society:{findFirst:vi.fn().mockResolvedValue({id:societyId})},
    societyBrandRevision:{findFirst:vi.fn().mockResolvedValue({
      config,digest:societyBrandDigest(config),
    })},
    societyBrandLogoAsset:{findFirst:vi.fn().mockResolvedValue(asset)},
  };
  const prisma={withTenantContext:vi.fn(async(_id:string,op:(tx:typeof tx)=>Promise<unknown>)=>op(tx))};
  const storage={
    headObject:vi.fn().mockResolvedValue({contentType:'image/png',contentLengthBytes:bytes.length}),
    getObjectBytes:vi.fn().mockResolvedValue(bytes),
    createUploadIntent:vi.fn(),createDownloadIntent:vi.fn(),deleteObject:vi.fn(),
  };
  const service=new PublishedBrandLogoService(prisma as never,
    new PrismaMembershipRepository(prisma as never),storage);
  return {service,tx,prisma,storage,asset,bytes,config};
}

describe('V5.3.15 authenticated published PNG delivery', () => {
  it('delivers only the verified current published society logo with no signed GET',async()=>{
    const f=setup();
    await expect(f.service.readPublished(principal)).resolves.toEqual(f.bytes);
    expect(f.prisma.withTenantContext).toHaveBeenCalledWith(societyId,expect.any(Function));
    expect(f.tx.societyBrandRevision.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({where:{societyId,publishedAt:{not:null}}}));
    expect(f.tx.societyBrandLogoAsset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({where:expect.objectContaining({societyId,id:assetId,status:'VERIFIED'})}));
    expect(f.storage.createDownloadIntent).not.toHaveBeenCalled();
  });

  it('rejects anonymous and independent home callers before any DB or storage work',async()=>{
    const f=setup();
    await expect(f.service.readPublished(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(f.service.readPublished({userId,roles:[AppRole.TENANT]})).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.prisma.withTenantContext).not.toHaveBeenCalled();
    expect(f.storage.getObjectBytes).not.toHaveBeenCalled();
  });

  it('blocks revoked, foreign-society and inactive membership before fetching image metadata',async()=>{
    const f=setup();
    f.tx.societyMembership.findMany.mockResolvedValue([]);
    await expect(f.service.readPublished({...principal,societyId:otherSociety})).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.tx.societyBrandRevision.findFirst).not.toHaveBeenCalled();
    f.tx.societyMembership.findMany.mockResolvedValue([{userId,societyId,role:AppRole.TENANT,active:true}]);
    f.tx.society.findFirst.mockResolvedValue(null);
    await expect(f.service.readPublished(principal)).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.storage.getObjectBytes).not.toHaveBeenCalled();
  });

  it('refuses unselected logo, draft-only revision and tampered published digest',async()=>{
    const f=setup();
    f.tx.societyBrandRevision.findFirst.mockResolvedValueOnce(null);
    await expect(f.service.readPublished(principal)).rejects.toBeInstanceOf(NotFoundException);
    f.tx.societyBrandRevision.findFirst.mockResolvedValueOnce({config:{displayName:'No logo'},
      digest:societyBrandDigest({displayName:'No logo'})});
    await expect(f.service.readPublished(principal)).rejects.toBeInstanceOf(NotFoundException);
    f.tx.societyBrandRevision.findFirst.mockResolvedValueOnce({config:f.config,digest:'0'.repeat(64)});
    await expect(f.service.readPublished(principal)).rejects.toBeInstanceOf(NotFoundException);
    expect(f.storage.headObject).not.toHaveBeenCalled();
  });

  it('refuses pending/rejected or wrong-society logo ownership',async()=>{
    const f=setup();
    f.tx.societyBrandLogoAsset.findFirst.mockResolvedValue(null);
    await expect(f.service.readPublished(principal)).rejects.toBeInstanceOf(NotFoundException);
    expect(f.storage.getObjectBytes).not.toHaveBeenCalled();
  });

  it('blocks invalid metadata, unexpired mutable PUT or unsafe object key',async()=>{
    for(const override of [
      {contentType:'image/svg+xml'},
      {contentLengthBytes:1},
      {uploadExpiresAt:new Date(Date.now()+120000)},
      {storageKey:'societies/'+otherSociety+'/branding/logos/'+assetId+'.png'},
    ]) {
      const f=setup();
      f.tx.societyBrandLogoAsset.findFirst.mockResolvedValue({...f.asset,...override});
      await expect(f.service.readPublished(principal)).rejects.toBeInstanceOf(NotFoundException);
      expect(f.storage.headObject).not.toHaveBeenCalled();
    }
  });

  it('fails closed on spoofed MIME, changed object bytes or digest mismatch',async()=>{
    const f=setup();
    f.storage.headObject.mockResolvedValueOnce({contentType:'text/html',contentLengthBytes:f.bytes.length});
    await expect(f.service.readPublished(principal)).rejects.toBeInstanceOf(NotFoundException);
    f.storage.getObjectBytes.mockResolvedValueOnce(Buffer.alloc(f.bytes.length));
    await expect(f.service.readPublished(principal)).rejects.toBeInstanceOf(NotFoundException);
    f.tx.societyBrandLogoAsset.findFirst.mockResolvedValue({...f.asset,sha256:'f'.repeat(64)});
    await expect(f.service.readPublished(principal)).rejects.toBeInstanceOf(NotFoundException);
  });
});
