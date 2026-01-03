import { Injectable } from '@angular/core';

export type MetricKey =
  | 'currentUserFetch'
  | 'userInit'
  | 'profileLoad'
  | 'missedCallsEmit'
  | 'missedCallsSet'
  | 'staticJsonCountries'
  | 'staticJsonCurrencies'
  | 'staticJsonProfessions'
  | 'staticJsonInterests'
  | 'staticJsonEducations'
  | 'socketInit'
  | 'socketBindHandlers';

@Injectable({ providedIn: 'root' })
export class MetricsService {
  private counters: Record<MetricKey, number> = {
    currentUserFetch: 0,
    userInit: 0,
    profileLoad: 0,
    missedCallsEmit: 0,
    missedCallsSet: 0,
    staticJsonCountries: 0,
    staticJsonCurrencies: 0,
    staticJsonProfessions: 0,
    staticJsonInterests: 0,
    staticJsonEducations: 0,
    socketInit: 0,
    socketBindHandlers: 0,
  };

  inc(key: MetricKey) {
    this.counters[key] = (this.counters[key] || 0) + 1;
    (window as any).__initCounters = { ...(window as any).__initCounters, ...this.counters };
  }

  getAll(): Record<MetricKey, number> {
    return { ...this.counters };
  }
}
