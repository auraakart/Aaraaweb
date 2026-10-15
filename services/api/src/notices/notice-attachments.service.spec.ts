import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { NoticeAttachmentsService } from './notice-attachments.service';

const societyId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const noticeId = '33333333-3333-4333-8333-333333333333';
const documentId = '44444444-4444-4444-8444-444444444444';

describe('NoticeAttachmentsService', () => {
  function setup() {
    const tx = { $queryRaw: vi.fn(), $executeRaw: vi.fn() };
    const prisma = { $transaction: vi.fn((cb: (client: typeof tx) => unknown) => cb(tx)), $queryRaw: vi.fn() };
    return { tx, prisma, service: new NoticeAttachmentsService(prisma as never) };
  }

  it('rejects attachment changes for a non-draft notice', async () => {
    const { tx, service } = setup();
    tx.$queryRaw.mockResolvedValueOnce([{ id: noticeId, status: 'PUBLISHED' }]);
    await expect(service.attach(societyId, actorId, noticeId, documentId)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejects documents that are not published all-member documents in the society', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: noticeId, status: 'DRAFT' }])
      .mockResolvedValueOnce([]);
    await expect(service.attach(societyId, actorId, noticeId, documentId)).rejects.toThrow('published all-member document');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('writes audit evidence when a document is attached', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: noticeId, status: 'DRAFT' }])
      .mockResolvedValueOnce([{ id: documentId }])
      .mockResolvedValueOnce([{ id: 'attachment-1', noticeId, documentId }]);
    tx.$executeRaw.mockResolvedValue(1);

    await expect(service.attach(societyId, actorId, noticeId, documentId)).resolves.toMatchObject({ documentId });
    const sql = (tx.$executeRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(sql).toContain('ATTACHMENT_ADDED');
  });

  it('hides attachments when the notice is not visible to the resident', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.listForResident(societyId, actorId, noticeId)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
