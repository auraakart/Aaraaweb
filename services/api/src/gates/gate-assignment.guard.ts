import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/bearer.guard';
import { GateAssignmentService } from './gate-assignment.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class GateAssignmentGuard implements CanActivate {
  constructor(private readonly assignments: GateAssignmentService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest & { body?: Record<string, unknown> }>();
    const principal = request.auth;
    if (!principal?.userId || !principal.societyId) throw new BadRequestException('Authenticated society guard is required');
    const gateId = request.body?.gateId;
    if (typeof gateId !== 'string' || !UUID.test(gateId)) throw new BadRequestException('Valid gateId is required');
    await this.assignments.assertAssigned(principal.societyId, gateId, principal.userId);
    return true;
  }
}
