import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/occupancy-authority.regression.spec.ts',
      'src/access/visitor-management.e2e.spec.ts',
      'src/accounting/payment-availability.service.spec.ts',
      'src/ai-operations/ai-operations.controlled-assignment.spec.ts',
      'src/privacy/privacy-self-context.spec.ts',
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
          statements: 55,
          branches: 55,
          functions: 50,
          lines: 55,
        },
        'src/access/access.service.ts': {
          statements: 45,
          branches: 40,
          functions: 45,
          lines: 45,
        },
        'src/auth/session.service.ts': {
          statements: 25,
          branches: 25,
          functions: 30,
          lines: 25,
        },
        'src/households/household.service.ts': {
          statements: 35,
          branches: 35,
          functions: 50,
          lines: 35,
        },
        'src/ai-operations/ai-operations.service.ts': {
          statements: 30,
          branches: 30,
          functions: 25,
          lines: 30,
        },
      },
    },
  },
});
