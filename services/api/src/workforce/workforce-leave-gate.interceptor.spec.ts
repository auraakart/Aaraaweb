import { BadRequestException, CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { WorkforceLeaveGateInterceptor } from './workforce-leave-gate.interceptor';
import { WorkforceLeaveService } from './workforce-leave.service';

describe('WorkforceLeaveGateInterceptor', () => {
  const leaves = {
    assertNoActiveLeave: jest.fn(),
    activeAssignmentIds: jest.fn(),
  } as unknown as WorkforceLeaveService;

  const interceptor = new WorkforceLeaveGateInterceptor(leaves);

  function context(request: Record<string, unknown>) {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => jest.clearAllMocks());

  it('blocks workforce check-in when the assignment is on leave', async () => {
    (leaves.assertNoActiveLeave as jest.Mock).mockRejectedValue(new BadRequestException('Worker is on approved leave today'));
    const next = { handle: jest.fn(() => of({ id: 'request-1' })) } as unknown as CallHandler;

    await expect(
      interceptor.intercept(
        context({
          method: 'POST',
          url: '/api/v1/workforce/gate/check-in',
          body: { assignmentId: 'assignment-1' },
          auth: { societyId: 'society-1' },
        }),
        next,
      ),
    ).rejects.toThrow('Worker is on approved leave today');
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('allows workforce check-in when there is no active leave', async () => {
    (leaves.assertNoActiveLeave as jest.Mock).mockResolvedValue(undefined);
    const next = { handle: jest.fn(() => of({ id: 'request-1' })) } as unknown as CallHandler;

    const stream = await interceptor.intercept(
      context({
        method: 'POST',
        url: '/api/v1/workforce/gate/check-in',
        body: { assignmentId: 'assignment-1' },
        auth: { societyId: 'society-1' },
      }),
      next,
    );

    await expect(lastValueFrom(stream)).resolves.toEqual({ id: 'request-1' });
    expect(leaves.assertNoActiveLeave).toHaveBeenCalledWith('society-1', 'assignment-1');
  });

  it('filters workers on leave from gate eligibility', async () => {
    (leaves.activeAssignmentIds as jest.Mock).mockResolvedValue(new Set(['assignment-2']));
    const next = {
      handle: jest.fn(() => of([{ id: 'assignment-1' }, { id: 'assignment-2' }])),
    } as unknown as CallHandler;

    const stream = await interceptor.intercept(
      context({
        method: 'GET',
        url: '/api/v1/workforce/gate/eligible',
        auth: { societyId: 'society-1' },
      }),
      next,
    );

    await expect(lastValueFrom(stream)).resolves.toEqual([{ id: 'assignment-1' }]);
    expect(leaves.activeAssignmentIds).toHaveBeenCalledWith('society-1', ['assignment-1', 'assignment-2']);
  });

  it('does not block workforce checkout', async () => {
    const next = { handle: jest.fn(() => of({ id: 'request-1' })) } as unknown as CallHandler;
    const stream = await interceptor.intercept(
      context({
        method: 'POST',
        url: '/api/v1/workforce/gate/check-out',
        body: { assignmentId: 'assignment-1' },
        auth: { societyId: 'society-1' },
      }),
      next,
    );

    await expect(lastValueFrom(stream)).resolves.toEqual({ id: 'request-1' });
    expect(leaves.assertNoActiveLeave).not.toHaveBeenCalled();
  });
});
