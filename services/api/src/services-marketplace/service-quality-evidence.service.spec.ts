import { describe, expect, it, vi } from 'vitest';
import { ServiceQualityEvidenceService } from './service-quality-evidence.service';

const userId = '11111111-1111-4111-8111-111111111111';
const assignmentId = '22222222-2222-4222-8222-222222222222';
const bookingId = '33333333-3333-4333-8333-333333333333';
const agentId = '44444444-4444-4444-8444-444444444444';
const providerId = '55555555-5555-4555-8555-555555555555';
function setup() {
  const tx = { $queryRaw: vi.fn() };
  const prisma = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(async (cb: (db: typeof tx) => Promise<unknown>) => cb(tx)),
  };
  const agents = { resolveAgent: vi.fn().mockResolvedValue({ agentId, providerId }) };
  const service = new ServiceQualityEvidenceService(
    prisma as unknown as ConstructorParameters<typeof ServiceQualityEvidenceService>[0],
    agents as unknown as ConstructorParameters<typeof ServiceQualityEvidenceService>[1],
  );
  return { prisma, tx, agents, service };
}

describe('Services 4.0.3 — quality checklist evidence', () => {
  it('exposes only the authenticated agent assignment booking-time checklist, including uncaptured legacy state', async () => {
    const { service, prisma, agents } = setup();
    const snapshot = { assignmentId, bookingId, assignmentStatus: 'ARRIVED', bookingStatus: 'IN_PROGRESS', templateVersion: 0, items: [], captured: false };
    prisma.$queryRaw.mockResolvedValueOnce([snapshot]);
    await expect(service.getAgentChecklist(userId, assignmentId)).resolves.toEqual({ ...snapshot, immutable: false });
    expect(agents.resolveAgent).toHaveBeenCalledWith(userId);
    const query = prisma.$queryRaw.mock.calls[0][0];
    expect(query.values).toEqual([assignmentId, agentId, providerId]);
    expect(query.strings.join(' ')).toContain('ConsumerServiceQualityChecklistSnapshot');
    expect(query.strings.join(' ')).not.toContain('addressSnapshot');
  });

  it('refuses foreign agent checklist access and never substitutes a current offering template', async () => {
    const { service, prisma } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.getAgentChecklist(userId, assignmentId)).rejects.toThrow('Provider assignment not found');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('does not read a checklist if the user has no active verified agent identity', async () => {
    const { service, prisma, agents } = setup();
    agents.resolveAgent.mockRejectedValueOnce(new Error('Provider agent access is not available'));
    await expect(service.getAgentChecklist(userId, assignmentId)).rejects.toThrow('access is not available');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('requires a verified assigned agent and an in-progress, arrived booking before writing', async () => {
    const { service, tx, agents } = setup();
    tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.recordForAgent(userId, assignmentId, { itemId: 'check_filter', passed: true }))
      .rejects.toThrow('Active assigned service is not available');
    expect(agents.resolveAgent).toHaveBeenCalledWith(userId);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const query = tx.$queryRaw.mock.calls[0][0];
    expect(query.strings.join(' ')).toContain('FOR UPDATE OF b');
    expect(query.values).toEqual(expect.arrayContaining([assignmentId, agentId, providerId, 'IN_PROGRESS']));
  });

  it('rejects evidence for a checklist item not captured for this booking', async () => {
    const { service, tx } = setup();
    tx.$queryRaw.mockResolvedValueOnce([{ bookingId }])
      .mockResolvedValueOnce([{ items: [{ id: 'inspect_filter', label: 'Inspect filter', required: true }] }]);
    await expect(service.recordForAgent(userId, assignmentId, { itemId: 'replace_filter', passed: false }))
      .rejects.toThrow('Checklist item is not part of this booking');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('rejects checklist assessment when there is no booking-time snapshot', async () => {
    const { service, tx } = setup();
    tx.$queryRaw.mockResolvedValueOnce([{ bookingId }]).mockResolvedValueOnce([]);
    await expect(service.recordForAgent(userId, assignmentId, { itemId: 'inspect_filter', passed: true }))
      .rejects.toThrow('Checklist item is not part of this booking');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('writes immutable append-only item evidence inside the booking-locked transaction', async () => {
    const { service, tx } = setup();
    const event = { id: '66666666-6666-4666-8666-666666666666', bookingId, assignmentId, itemId: 'inspect_filter', passed: false, note: 'Needs replacement' };
    tx.$queryRaw.mockResolvedValueOnce([{ bookingId }])
      .mockResolvedValueOnce([{ items: [{ id: 'inspect_filter', label: 'Inspect filter', required: true }] }])
      .mockResolvedValueOnce([event]);
    await expect(service.recordForAgent(userId, assignmentId, {
      itemId: 'inspect_filter', passed: false, note: ' Needs replacement ',
    })).resolves.toEqual(event);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    const sql = tx.$queryRaw.mock.calls[2][0];
    expect(sql.strings.join(' ')).toContain('INSERT INTO "ConsumerServiceQualityEvidence"');
    expect(sql.values).toEqual(expect.arrayContaining([bookingId, assignmentId, agentId, userId, 'inspect_filter', false, 'Needs replacement']));
  });

  it('requires consumer booking ownership before loading any evidence events', async () => {
    const { service, prisma } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.listForConsumer(userId, bookingId)).rejects.toThrow('Booking not found');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw.mock.calls[0][0].values).toEqual([bookingId, userId]);
  });

  it('returns evidence strictly within the verified assigned-agent scope', async () => {
    const { service, prisma } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([{ bookingId }]).mockResolvedValueOnce([{ itemId: 'inspect_filter', passed: true }]);
    await expect(service.listForAgent(userId, assignmentId)).resolves.toEqual([{ itemId: 'inspect_filter', passed: true }]);
    const authorization = prisma.$queryRaw.mock.calls[0][0];
    expect(authorization.values).toEqual([assignmentId, agentId, providerId]);
    expect(prisma.$queryRaw.mock.calls[1][0].values).toEqual([bookingId, assignmentId]);
  });

  it('does not read another agent assignment', async () => {
    const { service, prisma } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.listForAgent(userId, assignmentId)).rejects.toThrow('Provider assignment not found');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
