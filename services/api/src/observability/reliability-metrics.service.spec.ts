import { describe, expect, it } from 'vitest';
import { ReliabilityMetricsService } from './reliability-metrics.service';

describe('ReliabilityMetricsService', () => {
  it('tracks aggregate request, status and latency metrics without request identity data', () => {
    const metrics = new ReliabilityMetricsService();
    metrics.beginRequest();
    metrics.beginRequest();
    metrics.beginRequest();
    metrics.completeRequest(200, 12.5);
    metrics.completeRequest(302, 10);
    metrics.completeRequest(503, 30);
    metrics.recordRateLimited('otp-request');
    metrics.recordLimiterDegradation();

    const snapshot = metrics.snapshot();
    expect(snapshot).toMatchObject({
      totalRequests: 3,
      inflightRequests: 0,
      completedResponses: 3,
      responses2xx: 1,
      responses3xx: 1,
      responses5xx: 1,
      errorRate5xx: 0.3333,
      averageLatencyMs: 17.5,
      maxLatencyMs: 30,
      rateLimitedRequests: 1,
      limiterDegradations: 1,
    });
    expect(snapshot.rateLimitedByPolicy['otp-request']).toBe(1);
    expect(JSON.stringify(snapshot)).not.toContain('userId');
    expect(JSON.stringify(snapshot)).not.toContain('societyId');
  });
});
