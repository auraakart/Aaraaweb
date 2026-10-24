import { BadRequestException } from '@nestjs/common';
import { IsIn, IsInt, Max, Min } from 'class-validator';
import { TelemetryService } from '../observability/telemetry.service';

export const JOURNEYS = ['HELPDESK_SUBMIT', 'PAYMENT_PREPARATION', 'FINANCE_EXPORT'] as const;
export class JourneyMeasurementDto {
  @IsIn(JOURNEYS) journey!: typeof JOURNEYS[number];
  @IsIn(['SUCCEEDED', 'FAILED', 'CANCELLED', 'UNCONFIRMED']) outcome!: 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'UNCONFIRMED';
  @IsInt() @Min(0) @Max(3600000) durationMs!: number;
  @IsInt() @Min(0) @Max(5) retryCount!: number;
}

// Client-reported UX observations, never evidence of settlement, consent or UAT.
// Only finite dimensions are accepted: no user/property IDs or free text labels.
export function recordJourneyMeasurement(telemetry: TelemetryService, input: JourneyMeasurementDto) {
  if (!JOURNEYS.includes(input.journey) || !['SUCCEEDED', 'FAILED', 'CANCELLED', 'UNCONFIRMED'].includes(input.outcome) ||
    !Number.isInteger(input.durationMs) || input.durationMs < 0 || input.durationMs > 3600000 ||
    !Number.isInteger(input.retryCount) || input.retryCount < 0 || input.retryCount > 5) throw new BadRequestException('Invalid journey observation');
  const labels = { operation: input.journey, state: input.outcome, domain: 'CLIENT_REPORTED' };
  telemetry.increment('resident_journey_attempts', labels);
  telemetry.observe('resident_journey_duration_ms', input.durationMs, labels);
  telemetry.observe('resident_journey_retries', input.retryCount, labels);
}
