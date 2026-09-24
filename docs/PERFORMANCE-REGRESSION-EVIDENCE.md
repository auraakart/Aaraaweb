# Performance Regression Evidence

Date: 2026-09-18

## Purpose

Aaraagate now has a reproducible repository performance gate for the production-mode API. The goal is to catch order-of-magnitude latency, error-rate or throughput regressions before merge.

This evidence is deliberately **not** a production capacity, SLA or hosted-environment certification.

## Test environment

The GitHub workflow starts:

- PostgreSQL 16;
- Redis 7;
- the compiled NestJS API in `NODE_ENV=production`;
- one authenticated accountant session in an Enterprise finance-enabled society;
- a synthetic high-volume finance dataset with 100,000 captured payments, 100,000 allocations, and bounded reversal/refund exception evidence.

No OTP, push, payment, payout, hardware or other external provider is called.

## Scenarios and thresholds

| Scenario | Requests | Concurrency | p95 gate | Minimum throughput | Error rate |
| --- | ---: | ---: | ---: | ---: | ---: |
| `GET /api/v1/health/live` | 160 | 16 | <= 400 ms | >= 20 rps | 0% |
| `GET /api/v1/health/ready` | 120 | 12 | <= 750 ms | >= 10 rps | 0% |
| Authenticated `GET /api/v1/auth/contexts` | 160 | 16 | <= 900 ms | >= 10 rps | 0% |
| Treasurer `GET /api/v1/accounting/finance-operations/treasurer-control-centre` over 100k-payment seed | 24 | 4 | <= 2500 ms | >= 1.5 rps | 0% |

The authenticated context scenario exercises Bearer-token hashing/session validation, Redis-backed auth state, PostgreSQL relationship lookups and NestJS request/guard processing. The Treasurer scenario additionally exercises finance authorization plus bank/cash/budget/tax/refund aggregation against a synthetic 100k-payment/100k-allocation repository dataset. The seed deliberately uses set-based inserts and is not business or production data.

Thresholds are intentionally conservative enough to avoid treating normal shared GitHub-runner variability as a product regression, while still detecting severe degradation.

## Evidence output

Each run writes JSON containing:

- request count/concurrency;
- success/failure count;
- error rate;
- elapsed duration;
- requests per second;
- p50/p95/p99/max latency;
- configured threshold;
- overall pass/fail result.

The workflow uploads this JSON as an artifact tied to the exact candidate SHA.

## Claim boundary

A green repository benchmark proves only that the exact candidate does not exceed the configured regression thresholds on the controlled CI stack.

It does **not** prove:

- real society peak traffic capacity;
- internet/mobile-network latency;
- production database sizing or connection-pool limits;
- multi-region behavior;
- external provider latency;
- production p95/p99 SLO compliance;
- long-duration soak stability.

Those require hosted/load infrastructure and remain outside this repository-only mastermind gap-closure scope.
