import { BadRequestException, ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { GateAssignmentGuard } from './gate-assignment.guard';
import type { GateAssignmentService } from './gate-assignment.service';

function context(auth: unknown, body: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ auth, body }) }),
  } as unknown as ExecutionContext;
}

describe('GateAssignmentGuard', () => {
  it('allows an actively assigned guard at the requested gate', async () => {
    const assignments = { assertAssigned: vi.fn().mockResolvedValue({ id: 'assignment-1' }) } as unknown as GateAssignmentService;
    const guard = new GateAssignmentGuard(assignments);
    await expect(guard.canActivate(context(
      { userId: '11111111-1111-4111-8111-111111111111', societyId: '22222222-2222-4222-8222-222222222222', roles: ['SECURITY_GUARD'] },
      { gateId: '33333333-3333-4333-8333-333333333333' },
    ))).resolves.toBe(true);
    expect(assignments.assertAssigned).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('propagates assignment denial', async () => {
    const assignments = { assertAssigned: vi.fn().mockRejectedValue(new ForbiddenException('Guard is not assigned to this gate')) } as unknown as GateAssignmentService;
    const guard = new GateAssignmentGuard(assignments);
    await expect(guard.canActivate(context(
      { userId: '11111111-1111-4111-8111-111111111111', societyId: '22222222-2222-4222-8222-222222222222', roles: ['SECURITY_GUARD'] },
      { gateId: '33333333-3333-4333-8333-333333333333' },
    ))).rejects.toThrow('Guard is not assigned to this gate');
  });

  it('rejects missing or malformed gate context before querying assignments', async () => {
    const assignments = { assertAssigned: vi.fn() } as unknown as GateAssignmentService;
    const guard = new GateAssignmentGuard(assignments);
    await expect(guard.canActivate(context(
      { userId: '11111111-1111-4111-8111-111111111111', societyId: '22222222-2222-4222-8222-222222222222', roles: ['SECURITY_GUARD'] },
      { gateId: 'not-a-uuid' },
    ))).rejects.toBeInstanceOf(BadRequestException);
    expect(assignments.assertAssigned).not.toHaveBeenCalled();
  });
});
