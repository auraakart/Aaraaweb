import { Injectable } from '@nestjs/common';

export type TelemetryLabelKey =
  | 'method'
  | 'route'
  | 'statusClass'
  | 'dependency'
  | 'state'
  | 'operation'
  | 'domain';

export type TelemetryLabels = Partial<Record<TelemetryLabelKey, string>>;

export type TelemetrySnapshot = {
  generatedAt: string;
  counters: Array<{ name: string; labels: TelemetryLabels; value: number }>;
  gauges: Array<{ name: string; labels: TelemetryLabels; value: number }>;
  histograms: Array<{
    name: string;
    labels: TelemetryLabels;
    count: number;
    sum: number;
    max: number;
    average: number;
  }>;
  droppedSeries: number;
};

export interface TelemetryExporter {
  export(snapshot: TelemetrySnapshot): void | Promise<void>;
}

const LABEL_KEYS: readonly TelemetryLabelKey[] = [
  'method',
  'route',
  'statusClass',
  'dependency',
  'state',
  'operation',
  'domain',
];

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NUMERIC_SEGMENT = /^\d+$/;
const OPAQUE_SEGMENT = /^[A-Za-z0-9_-]{24,}$/;
const METRIC_NAME = /^[a-z][a-z0-9_]{1,63}$/;

export function normalizeTelemetryRoute(value: string) {
  const path = (value || '/').split('?')[0] || '/';
  const normalized = path
    .split('/')
    .map((segment) => {
      if (!segment) return segment;
      if (UUID_SEGMENT.test(segment) || NUMERIC_SEGMENT.test(segment) || OPAQUE_SEGMENT.test(segment)) {
        return ':id';
      }
      return segment.length > 64 ? ':segment' : segment;
    })
    .join('/');
  return normalized.slice(0, 240) || '/';
}

function safeMetricName(name: string) {
  return METRIC_NAME.test(name) ? name : 'invalid_metric_name';
}

function safeLabels(labels: TelemetryLabels): TelemetryLabels {
  const safe: TelemetryLabels = {};
  for (const key of LABEL_KEYS) {
    const value = labels[key];
    if (value === undefined) continue;
    safe[key] = key === 'route'
      ? normalizeTelemetryRoute(value)
      : value.slice(0, 96);
  }
  return safe;
}

function seriesKey(name: string, labels: TelemetryLabels) {
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([name, entries]);
}

@Injectable()
export class TelemetryService {
  private readonly counters = new Map<string, { name: string; labels: TelemetryLabels; value: number }>();
  private readonly gauges = new Map<string, { name: string; labels: TelemetryLabels; value: number }>();
  private readonly histograms = new Map<string, {
    name: string;
    labels: TelemetryLabels;
    count: number;
    sum: number;
    max: number;
  }>();
  private droppedSeries = 0;
  private readonly maxSeries = 512;

  increment(name: string, labels: TelemetryLabels = {}, value = 1) {
    if (!Number.isFinite(value) || value < 0) return;
    const metric = safeMetricName(name);
    const dimensions = safeLabels(labels);
    const key = seriesKey(metric, dimensions);
    const current = this.counters.get(key);
    if (current) {
      current.value += value;
      return;
    }
    if (!this.reserveSeries()) return;
    this.counters.set(key, { name: metric, labels: dimensions, value });
  }

  gauge(name: string, value: number, labels: TelemetryLabels = {}) {
    if (!Number.isFinite(value)) return;
    const metric = safeMetricName(name);
    const dimensions = safeLabels(labels);
    const key = seriesKey(metric, dimensions);
    const current = this.gauges.get(key);
    if (current) {
      current.value = value;
      return;
    }
    if (!this.reserveSeries()) return;
    this.gauges.set(key, { name: metric, labels: dimensions, value });
  }

  observe(name: string, value: number, labels: TelemetryLabels = {}) {
    if (!Number.isFinite(value) || value < 0) return;
    const metric = safeMetricName(name);
    const dimensions = safeLabels(labels);
    const key = seriesKey(metric, dimensions);
    const current = this.histograms.get(key);
    if (current) {
      current.count += 1;
      current.sum += value;
      current.max = Math.max(current.max, value);
      return;
    }
    if (!this.reserveSeries()) return;
    this.histograms.set(key, {
      name: metric,
      labels: dimensions,
      count: 1,
      sum: value,
      max: value,
    });
  }

  snapshot(): TelemetrySnapshot {
    return {
      generatedAt: new Date().toISOString(),
      counters: [...this.counters.values()].map((item) => ({ ...item, labels: { ...item.labels } })),
      gauges: [...this.gauges.values()].map((item) => ({ ...item, labels: { ...item.labels } })),
      histograms: [...this.histograms.values()].map((item) => ({
        ...item,
        labels: { ...item.labels },
        average: item.count ? item.sum / item.count : 0,
      })),
      droppedSeries: this.droppedSeries,
    };
  }

  async exportTo(exporter: TelemetryExporter) {
    await exporter.export(this.snapshot());
  }

  private reserveSeries() {
    const total = this.counters.size + this.gauges.size + this.histograms.size;
    if (total < this.maxSeries) return true;
    this.droppedSeries += 1;
    return false;
  }
}
