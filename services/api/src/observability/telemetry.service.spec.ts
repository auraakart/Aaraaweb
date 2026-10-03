import { describe, expect, it, vi } from 'vitest';
import { normalizeTelemetryRoute, TelemetryService } from './telemetry.service';

describe('TelemetryService', () => {
  it('normalizes dynamic route segments before they become metric labels', () => {
    expect(normalizeTelemetryRoute('/api/v1/units/11111111-1111-4111-8111-111111111111/payments?secret=x'))
      .toBe('/api/v1/units/:id/payments');
    expect(normalizeTelemetryRoute('/api/v1/notices/123/events')).toBe('/api/v1/notices/:id/events');
  });

  it('records counters, gauges and bounded histogram summaries without identity labels', () => {
    const telemetry = new TelemetryService();
    telemetry.increment('http_requests_total', {
      method: 'GET',
      route: '/api/v1/units/11111111-1111-4111-8111-111111111111/payments',
      statusClass: '2xx',
    });
    telemetry.observe('http_request_duration_ms', 20, { method: 'GET', route: '/api/v1/units/123/payments', statusClass: '2xx' });
    telemetry.observe('http_request_duration_ms', 40, { method: 'GET', route: '/api/v1/units/456/payments', statusClass: '2xx' });
    telemetry.gauge('dependency_ready', 1, { dependency: 'database' });

    const snapshot = telemetry.snapshot();
    expect(snapshot.counters).toEqual([
      expect.objectContaining({
        name: 'http_requests_total',
        labels: { method: 'GET', route: '/api/v1/units/:id/payments', statusClass: '2xx' },
        value: 1,
      }),
    ]);
    expect(snapshot.histograms).toEqual([
      expect.objectContaining({
        name: 'http_request_duration_ms',
        labels: { method: 'GET', route: '/api/v1/units/:id/payments', statusClass: '2xx' },
        count: 2,
        sum: 60,
        max: 40,
        average: 30,
      }),
    ]);
    expect(snapshot.gauges).toEqual([
      expect.objectContaining({ name: 'dependency_ready', labels: { dependency: 'database' }, value: 1 }),
    ]);
    expect(JSON.stringify(snapshot)).not.toContain('11111111-1111-4111-8111-111111111111');
  });

  it('caps series growth and reports dropped cardinality instead of growing without bound', () => {
    const telemetry = new TelemetryService(2);
    telemetry.increment('requests_total', { route: '/one' });
    telemetry.increment('requests_total', { route: '/two' });
    telemetry.increment('requests_total', { route: '/three' });

    const snapshot = telemetry.snapshot();
    expect(snapshot.counters).toHaveLength(2);
    expect(snapshot.droppedSeries).toBe(1);
  });

  it('exports a provider-neutral snapshot without coupling to an external backend', async () => {
    const telemetry = new TelemetryService();
    telemetry.gauge('dependency_ready', 1, { dependency: 'auth_state' });
    const exporter = { export: vi.fn() };

    await telemetry.exportTo(exporter);

    expect(exporter.export).toHaveBeenCalledWith(expect.objectContaining({
      gauges: [expect.objectContaining({ name: 'dependency_ready' })],
    }));
  });
});
