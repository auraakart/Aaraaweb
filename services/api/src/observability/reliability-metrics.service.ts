import { Injectable } from '@nestjs/common';

type PolicyName = 'otp-request' | 'otp-verify' | 'auth-refresh' | 'payment-webhook' | 'api';

@Injectable()
export class ReliabilityMetricsService {
  private readonly startedAt = Date.now();
  private totalRequests = 0;
  private inflightRequests = 0;
  private responses2xx = 0;
  private responses3xx = 0;
  private responses4xx = 0;
  private responses5xx = 0;
  private totalDurationMs = 0;
  private maxDurationMs = 0;
  private rateLimitedRequests = 0;
  private limiterDegradations = 0;
  private readonly rateLimitedByPolicy: Record<PolicyName, number> = {
    'otp-request': 0,
    'otp-verify': 0,
    'auth-refresh': 0,
    'payment-webhook': 0,
    api: 0,
  };

  beginRequest() {
    this.totalRequests += 1;
    this.inflightRequests += 1;
  }

  completeRequest(statusCode: number, durationMs: number) {
    this.inflightRequests = Math.max(0, this.inflightRequests - 1);
    if (statusCode >= 200 && statusCode < 300) this.responses2xx += 1;
    else if (statusCode >= 300 && statusCode < 400) this.responses3xx += 1;
    else if (statusCode >= 400 && statusCode < 500) this.responses4xx += 1;
    else if (statusCode >= 500) this.responses5xx += 1;
    const duration = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
    this.totalDurationMs += duration;
    this.maxDurationMs = Math.max(this.maxDurationMs, duration);
  }

  recordRateLimited(policy: PolicyName) {
    this.rateLimitedRequests += 1;
    this.rateLimitedByPolicy[policy] += 1;
  }

  recordLimiterDegradation() {
    this.limiterDegradations += 1;
  }

  snapshot() {
    const completed = this.responses2xx + this.responses3xx + this.responses4xx + this.responses5xx;
    return {
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      totalRequests: this.totalRequests,
      inflightRequests: this.inflightRequests,
      completedResponses: completed,
      responses2xx: this.responses2xx,
      responses3xx: this.responses3xx,
      responses4xx: this.responses4xx,
      responses5xx: this.responses5xx,
      errorRate5xx: completed ? Number((this.responses5xx / completed).toFixed(4)) : 0,
      averageLatencyMs: completed ? Number((this.totalDurationMs / completed).toFixed(2)) : 0,
      maxLatencyMs: Number(this.maxDurationMs.toFixed(2)),
      rateLimitedRequests: this.rateLimitedRequests,
      limiterDegradations: this.limiterDegradations,
      rateLimitedByPolicy: { ...this.rateLimitedByPolicy },
    };
  }
}
