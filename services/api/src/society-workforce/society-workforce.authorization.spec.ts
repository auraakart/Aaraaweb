import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { GateAssignmentGuard } from '../gates/gate-assignment.guard';
import { SocietyWorkforceController } from './society-workforce.controller';

describe('SocietyWorkforceController authorization', () => {
  it('requires dedicated society workforce permissions for roster operations', () => {
    for (const method of ['list', 'summary', 'attendance', 'leaves', 'timeline'] as const) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, SocietyWorkforceController.prototype[method])).toEqual([
        AppPermission.SOCIETY_WORKFORCE_READ,
      ]);
    }
    for (const method of ['create', 'configure', 'verify', 'reject', 'suspend', 'reactivate', 'addLeave', 'cancelLeave', 'correctAttendance'] as const) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, SocietyWorkforceController.prototype[method])).toEqual([
        AppPermission.SOCIETY_WORKFORCE_MANAGE,
      ]);
    }
  });

  it('keeps gate attendance behind gate-processing permission and assigned-gate enforcement', () => {
    for (const method of ['gateEligible', 'gateLookup', 'checkIn', 'checkOut'] as const) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, SocietyWorkforceController.prototype[method])).toEqual([
        AppPermission.GATE_ACCESS_PROCESS,
      ]);
      const guards = (Reflect.getMetadata(GUARDS_METADATA, SocietyWorkforceController.prototype[method]) ?? []) as unknown[];
      expect(guards).toContain(GateAssignmentGuard);
    }
  });
});
