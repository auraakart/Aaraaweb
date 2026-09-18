import { describe, expect, it } from 'vitest';
import { ReliabilityMetricsController } from './reliability-metrics.controller';

describe('ReliabilityMetricsController', () => {
  it('returns release metadata plus aggregate operational metrics only', () => {
    const metrics = {
      snapshot: () => ({
        uptimeSeconds: 12,
        totalRequests: 20,
        inflightRequests: 1,
        completedResponses: 19,
        responses2xx: 17,
        responses4xx: 1,
        responses5xx: 1,
        errorRate5xx: 0.0526,
        averageLatencyMs: 18.2,
        maxLatencyMs: 90,
        rateLimitedRequests: 2,
        limiterDegradations: 0,
        rateLimitedByPolicy: { 'otp-request': 1, 'otp-verify': 0, 'auth-refresh': 0, 'payment-webhook': 0, api: 1 },
      }),
    };
    const controller = new ReliabilityMetricsController(metrics as never);
    const result = controller.getMetrics();
    expect(result).toMatchObject({
      service: 'aaraagate-api',
      totalRequests: 20,
      responses5xx: 1,
      rateLimitedRequests: 2,
    });
    const encoded = JSON.stringify(result);
    expect(encoded).not.toContain('userId');
    expect(encoded).not.toContain('societyId');
    expect(encoded).not.toContain('Authorization');
  });
});
