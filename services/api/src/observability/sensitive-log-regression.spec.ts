import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const protectedSources = [
  '../notifications/push-notification.service.ts',
  '../notifications/notification-realtime.service.ts',
  '../facilities/facilities-alerts.service.ts',
  '../facilities/facilities-preventive.service.ts',
  '../households/occupancy-lifecycle.runner.ts',
  '../accounting/payment-reconciliation.runner.ts',
  '../services-marketplace/consumer-fulfilment.service.ts',
  '../services-marketplace/consumer-dispatch.service.ts',
  '../services-marketplace/consumer-service-completion.service.ts',
];

describe('V4.5 sensitive operational logging boundary', () => {
  it('keeps reviewed operational log paths on the safe error descriptor', () => {
    for (const relative of protectedSources) {
      const source = readFileSync(join(__dirname, relative), 'utf8');
      expect(source, relative).not.toMatch(/logger\.(?:log|warn|error)\([^\n]*(?:\.message|\.stack)/);
      expect(source, relative).not.toContain('error instanceof Error ? error.message');
      expect(source, relative).not.toContain('e instanceof Error?e.stack');
    }
  });

  it('keeps payment retry evidence from persisting raw gateway exception messages', () => {
    const source = readFileSync(join(__dirname, '../accounting/payment-reconciliation.runner.ts'), 'utf8');
    expect(source).toContain('failureMessage:safeOperationalError(error)');
    expect(source).not.toContain('failureMessage:this.message(error)');
  });
});
