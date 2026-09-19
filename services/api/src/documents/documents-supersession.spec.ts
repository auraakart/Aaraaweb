import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DocumentsService } from './documents.service';

function sqlText(call: unknown): string {
  return ((call as { strings?: readonly string[] }).strings ?? []).join('?');
}

describe('DocumentsService supersession', () => {
  const societyId='11111111-1111-4111-8111-111111111111';
  const actorId='22222222-2222-4222-8222-222222222222';
  const oldId='33333333-3333-4333-8333-333333333333';
  const newId='44444444-4444-4444-8444-444444444444';

  it('rejects replacement when the source document is not published', async () => {
    const tx={$queryRaw:vi.fn().mockResolvedValueOnce([{id:oldId,societyId,status:'DRAFT',version:1}]),$executeRaw:vi.fn()};
    const prisma={$transaction:vi.fn(async(cb:(client:unknown)=>unknown)=>cb(tx))};
    const service=new DocumentsService(prisma as never);

    await expect(service.createReplacementDraft(societyId,actorId,oldId,{
      storageKey:`societies/${societyId}/documents/replacement.pdf`,
      fileName:'replacement.pdf',mimeType:'application/pdf',sizeBytes:100,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a version-incremented replacement draft without altering the published source', async () => {
    const current={id:oldId,societyId,unitId:null,audience:'ALL_MEMBERS',status:'PUBLISHED',storageKey:'old',mimeType:'application/pdf',sizeBytes:100n,category:'POLICY',title:'Policy',description:'Current policy',fileName:'old.pdf',version:3,supersedesDocumentId:null,supersededByDocumentId:null};
    const tx={
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([current])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{id:newId,status:'DRAFT',version:4,supersedesDocumentId:oldId}]),
      $executeRaw:vi.fn().mockResolvedValue(1),
    };
    const prisma={$transaction:vi.fn(async(cb:(client:unknown)=>unknown)=>cb(tx))};
    const service=new DocumentsService(prisma as never);
    const result=await service.createReplacementDraft(societyId,actorId,oldId,{
      storageKey:`societies/${societyId}/documents/replacement.pdf`,
      fileName:'replacement.pdf',mimeType:'application/pdf',sizeBytes:120,description:'Updated policy',
    });

    expect(result).toMatchObject({id:newId,status:'DRAFT',version:4,supersedesDocumentId:oldId});
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(sqlText(tx.$queryRaw.mock.calls[2]?.[0])).toContain('"supersedesDocumentId"');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects a second active replacement draft for the same published document', async () => {
    const current={id:oldId,societyId,unitId:null,audience:'ALL_MEMBERS',status:'PUBLISHED',version:1,supersededByDocumentId:null};
    const tx={
      $queryRaw:vi.fn().mockResolvedValueOnce([current]).mockResolvedValueOnce([{id:newId}]),
      $executeRaw:vi.fn(),
    };
    const prisma={$transaction:vi.fn(async(cb:(client:unknown)=>unknown)=>cb(tx))};
    const service=new DocumentsService(prisma as never);

    await expect(service.createReplacementDraft(societyId,actorId,oldId,{
      storageKey:`societies/${societyId}/documents/replacement.pdf`,
      fileName:'replacement.pdf',mimeType:'application/pdf',sizeBytes:100,
    })).rejects.toThrow('A replacement version already exists');
  });

  it('publishes replacement and archives the prior version atomically with VERSION_REPLACED evidence', async () => {
    const draft={id:newId,societyId,status:'DRAFT',version:2,supersedesDocumentId:oldId,supersededByDocumentId:null};
    const prior={id:oldId,societyId,status:'PUBLISHED',version:1,supersededByDocumentId:null};
    const tx={
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([draft])
        .mockResolvedValueOnce([prior])
        .mockResolvedValueOnce([{...draft,status:'PUBLISHED'}])
        .mockResolvedValueOnce([{...prior,status:'ARCHIVED',supersededByDocumentId:newId}]),
      $executeRaw:vi.fn().mockResolvedValue(2),
    };
    const prisma={$transaction:vi.fn(async(cb:(client:unknown)=>unknown)=>cb(tx))};
    const service=new DocumentsService(prisma as never);
    const result=await service.publish(societyId,actorId,newId);

    expect(result).toMatchObject({id:newId,status:'PUBLISHED'});
    expect(tx.$queryRaw).toHaveBeenCalledTimes(4);
    expect(sqlText(tx.$queryRaw.mock.calls[3]?.[0])).toContain('"supersededByDocumentId"');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(sqlText(tx.$executeRaw.mock.calls[0]?.[0])).toContain('VERSION_REPLACED');
  });

  it('fails closed when replacement source is outside the current society', async () => {
    const tx={$queryRaw:vi.fn().mockResolvedValueOnce([]),$executeRaw:vi.fn()};
    const prisma={$transaction:vi.fn(async(cb:(client:unknown)=>unknown)=>cb(tx))};
    const service=new DocumentsService(prisma as never);
    await expect(service.createReplacementDraft(societyId,actorId,oldId,{
      storageKey:`societies/${societyId}/documents/replacement.pdf`,
      fileName:'replacement.pdf',mimeType:'application/pdf',sizeBytes:100,
    })).rejects.toBeInstanceOf(NotFoundException);
  });
});
