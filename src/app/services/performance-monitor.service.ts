import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class PerformanceMonitorService {
  private debug = false;
  private counters = {
    userFetchCount: 0,
    userNormalizeCount: 0,
    requestsFetchCount: 0,
    missedCallsSetCount: 0,
    socketBindCount: 0
  };

  incrementUserFetch() {
    this.counters.userFetchCount++;
    if (this.debug) console.log(`[PERF] User fetch count: ${this.counters.userFetchCount}`);
  }

  incrementUserNormalize() {
    this.counters.userNormalizeCount++;
    if (this.debug) console.log(`[PERF] User normalize count: ${this.counters.userNormalizeCount}`);
  }

  incrementRequestsFetch() {
    this.counters.requestsFetchCount++;
    if (this.debug) console.log(`[PERF] Requests fetch count: ${this.counters.requestsFetchCount}`);
  }

  incrementMissedCallsSet() {
    this.counters.missedCallsSetCount++;
    if (this.debug) console.log(`[PERF] MissedCalls set count: ${this.counters.missedCallsSetCount}`);
  }

  incrementSocketBind() {
    this.counters.socketBindCount++;
    if (this.debug) console.log(`[PERF] Socket bind count: ${this.counters.socketBindCount}`);
  }

  getCounters() {
    return { ...this.counters };
  }

  resetCounters() {
    if (this.debug) console.log('[PERF] Resetting all counters', this.counters);
    this.counters = {
      userFetchCount: 0,
      userNormalizeCount: 0,
      requestsFetchCount: 0,
      missedCallsSetCount: 0,
      socketBindCount: 0
    };
  }

  logSummary() {
    console.log('====== PERFORMANCE SUMMARY ======');
    console.log('User Fetch Count:', this.counters.userFetchCount);
    console.log('User Normalize Count:', this.counters.userNormalizeCount);
    console.log('Requests Fetch Count:', this.counters.requestsFetchCount);
    console.log('MissedCalls Set Count:', this.counters.missedCallsSetCount);
    console.log('Socket Bind Count:', this.counters.socketBindCount);
    console.log('==================================');
  }
}
