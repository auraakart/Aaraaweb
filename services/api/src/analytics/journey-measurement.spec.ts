import { describe, expect, it } from 'vitest';
import { TelemetryService } from '../observability/telemetry.service';
import { recordJourneyMeasurement } from './journey-measurement';

describe('Privacy-bounded client journey measurements', () => {
  it('records only finite labels and numeric duration/retries', () => {
    const telemetry = new TelemetryService();
    recordJourneyMeasurement(telemetry, {journey:'PAYMENT_PREPARATION',outcome:'SUCCEEDED',durationMs:123,retryCount:1});
    const snapshot = telemetry.snapshot();
    expect(snapshot.counters[0].labels).toEqual({operation:'PAYMENT_PREPARATION',state:'SUCCEEDED',domain:'CLIENT_REPORTED'});
    expect(snapshot.histograms.map(row=>row.sum)).toEqual([123,1]);
  });
  it('rejects unbounded values and unknown labels before allocating metric series', () => {
    const telemetry = new TelemetryService();
    for(const input of [{durationMs:Infinity},{retryCount:6},{journey:'private-free-text'},{outcome:'CHARGED'}]) {
      expect(()=>recordJourneyMeasurement(telemetry,{journey:'HELPDESK_SUBMIT',outcome:'FAILED',durationMs:1,retryCount:0,...input} as never)).toThrow();
    }
    expect(telemetry.snapshot().counters).toHaveLength(0);
  });
});
