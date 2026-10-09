import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/occupancy-authority.regression.spec.ts',
      'src/access/visitor-management.e2e.spec.ts',
      'src/accounting/payment-availability.service.spec.ts',
      'src/auth/session.service.spec.ts',
      'src/ai-operations/ai-operations.controlled-assignment.spec.ts',
      'src/ai-operations/ai-operations.service.spec.ts',
      'src/privacy/privacy-self-context.spec.ts',
      'src/privacy/privacy-self.controller.spec.ts',
      'src/households/household.service.spec.ts',
    ],
    coverage: {
      enabled: true,
      provider: 'v8',
      reportsDirectory: './coverage-risk',
      reporter: ['text', 'json-summary', 'lcov'],
      include: [
        'src/access/access.service.ts',
        'src/auth/session.service.ts',
        'src/households/household.service.ts',
        'src/accounting/payment-availability.service.ts',
        'src/ai-operations/ai-operations.service.ts',
        'src/privacy/privacy-self.controller.ts',
      ],
      thresholds: {
        'src/accounting/payment-availability.service.ts': {
          statements: 90,
          branches: 75,
          functions: 90,
          lines: 90,
        },
        'src/privacy/privacy-self.controller.ts': {
          statements: 85,
          branches: 60,
          functions: 80,
          lines: 85,
        },
        'src/access/access.service.ts': {
          statements: 50,
          branches: 40,
          functions: 60,
          lines: 55,
        },
        'src/auth/session.service.ts': {
          statements: 75,
          branches: 80,
          functions: 80,
          lines: 75,
        },
        'src/households/household.service.ts': {
          statements: 60,
          branches: 45,
          functions: 80,
          lines: 65,
        },
        'src/ai-operations/ai-operations.service.ts': {
          statements: 70,
          branches: 40,
          functions: 65,
          lines: 70,
        },
      },
    },
  },
});
