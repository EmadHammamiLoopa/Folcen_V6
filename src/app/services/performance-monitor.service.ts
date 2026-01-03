import { Injectable } from '@angular/core';

/**
 * Performance monitoring service to track duplicate operations
 * This is for debugging and optimization purposes only
 */
@Injectable({
  providedIn: 'root'
})
export class PerformanceMonitorService {
  private counters = {
    userFetchCount: 0,
    userNormalizeCount: 0,
    requestsFetchCount: 0,
    missedCallsSetCount: 0,
    socketBindCount: 0
  };

  incrementUserFetch() {
    this.counters.userFetchCount++;
    console.log(`📊 [PERF] User fetch count: ${this.counters.userFetchCount}`);
  }

  incrementUserNormalize() {
    this.counters.userNormalizeCount++;
    console.log(`📊 [PERF] User normalize count: ${this.counters.userNormalizeCount}`);
  }

  incrementRequestsFetch() {
    this.counters.requestsFetchCount++;
    console.log(`📊 [PERF] Requests fetch count: ${this.counters.requestsFetchCount}`);
  }

  incrementMissedCallsSet() {
    this.counters.missedCallsSetCount++;
    console.log(`📊 [PERF] MissedCalls set count: ${this.counters.missedCallsSetCount}`);
  }

  incrementSocketBind() {
    this.counters.socketBindCount++;
    console.log(`📊 [PERF] Socket bind count: ${this.counters.socketBindCount}`);
  }

  getCounters() {
    return { ...this.counters };
  }

  resetCounters() {
    console.log('📊 [PERF] Resetting all counters', this.counters);
    this.counters = {
      userFetchCount: 0,
      userNormalizeCount: 0,
      requestsFetchCount: 0,
      missedCallsSetCount: 0,
      socketBindCount: 0
    };
  }

  logSummary() {
    console.log('📊 ====== PERFORMANCE SUMMARY ======');
    console.log('📊 User Fetch Count:', this.counters.userFetchCount);
    console.log('📊 User Normalize Count:', this.counters.userNormalizeCount);
    console.log('📊 Requests Fetch Count:', this.counters.requestsFetchCount);
    console.log('📊 MissedCalls Set Count:', this.counters.missedCallsSetCount);
    console.log('📊 Socket Bind Count:', this.counters.socketBindCount);
    console.log('📊 ==================================');
  }
}
