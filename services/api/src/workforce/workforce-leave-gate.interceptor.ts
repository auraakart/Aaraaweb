import { BadRequestException, CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { WorkforceLeaveService } from './workforce-leave.service';

@Injectable()
export class WorkforceLeaveGateInterceptor implements NestInterceptor {
  constructor(private readonly leaves: WorkforceLeaveService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<{
      method?: string;
      url?: string;
      body?: { assignmentId?: string };
      auth?: { societyId?: string };
    }>();
    const path = (request.url ?? '').split('?')[0];
    const societyId = request.auth?.societyId;

    if (!societyId || !path.includes('/workforce/gate/')) return next.handle();

    if (request.method === 'POST' && path.endsWith('/workforce/gate/check-in')) {
      const assignmentId = request.body?.assignmentId;
      if (!assignmentId) throw new BadRequestException('Workforce assignment is required');
      await this.leaves.assertNoActiveLeave(societyId, assignmentId);
      return next.handle();
    }

    if (request.method === 'GET' && path.endsWith('/workforce/gate/eligible')) {
      return next.handle().pipe(
        mergeMap(async (value: unknown) => {
          if (!Array.isArray(value) || !value.length) return value;
          const assignmentIds = value
            .map((item) => (item && typeof item === 'object' && 'id' in item ? String((item as { id: unknown }).id) : ''))
            .filter(Boolean);
          const onLeave = await this.leaves.activeAssignmentIds(societyId, assignmentIds);
          return value.filter((item) => {
            if (!item || typeof item !== 'object' || !('id' in item)) return true;
            return !onLeave.has(String((item as { id: unknown }).id));
          });
        }),
      );
    }

    return next.handle();
  }
}
