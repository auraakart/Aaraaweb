import { BadRequestException } from '@nestjs/common';
import { AuditEventType } from '@prisma/client';

export function auditEventFilter(value?: string) {
  if (!value) return undefined;
  if (!Object.values(AuditEventType).includes(value as AuditEventType)) {
    throw new BadRequestException('event must be a valid audit event type');
  }
  return value as AuditEventType;
}
