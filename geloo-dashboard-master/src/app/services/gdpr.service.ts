import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { DataService } from './data.service';

interface CacheEntry { data: any; expires: number; }

@Injectable({ providedIn: 'root' })
export class GdprService extends DataService {

  private cache = new Map<string, CacheEntry>();
  private readonly DEFAULT_TTL = 30_000; // 30 s

  constructor(http: HttpClient) { super(http); }

  /** Evict one key prefix or all keys */
  clearCache(keyPrefix?: string) {
    if (!keyPrefix) { this.cache.clear(); return; }
    for (const k of Array.from(this.cache.keys())) {
      if (k.startsWith(keyPrefix)) this.cache.delete(k);
    }
  }

  private cachedGet(key: string, req$: Observable<any>, ttl = this.DEFAULT_TTL): Observable<any> {
    const hit = this.cache.get(key);
    if (hit && Date.now() < hit.expires) return of(hit.data);
    return req$.pipe(tap(data => this.cache.set(key, { data, expires: Date.now() + ttl })));
  }

  // ─── DSAR / Portability ──────────────────────────────────────────

  /** Fetch full data export for a user (query-param, not path-param). */
  exportUserData(userId: string, page = 1): Observable<object> {
    return this.sendGetRequest('gdpr/portability', { userId, page, limit: 100 });
  }

  // ─── Erasure ─────────────────────────────────────────────────────

  erasePreview(userId: string): Observable<object> {
    return this.sendGetRequest('gdpr/erase-preview', { userId });
  }

  eraseUser(userId: string, reason: string): Observable<object> {
    this.clearCache(`consent:${userId}`);
    this.clearCache(`dsar:${userId}`);
    return this.sendPostRequest('gdpr/erase', { userId, reason });
  }

  // ─── Author Anonymization ─────────────────────────────────────────

  anonymizeAuthor(userId: string): Observable<object> {
    return this.sendPostRequest('gdpr/anonymize-author', { userId });
  }

  // ─── Consent ─────────────────────────────────────────────────────

  getConsentStatus(userId: string): Observable<object> {
    return this.cachedGet(
      `consent:${userId}`,
      this.sendGetRequest('gdpr/consent-status', { userId })
    );
  }

  updateConsent(userId: string, key: string, value: boolean): Observable<object> {
    this.clearCache(`consent:${userId}`);
    return this.sendPutRequest('gdpr/consent', { userId, key, value });
  }

  // ─── Rectification ───────────────────────────────────────────────

  rectifyUser(userId: string, fields: any): Observable<object> {
    return this.sendPutRequest(`gdpr/rectify/${userId}`, fields);
  }

  // ─── Audit Log ───────────────────────────────────────────────────

  getAuditLogs(params: { userId?: string; action?: string; page?: number; limit?: number } = {}): Observable<object> {
    return this.sendGetRequest('gdpr/audit-logs', params);
  }

  // ─── Interest Analytics ──────────────────────────────────────────

  getAggregatedInterests(params: { fromDate?: string; toDate?: string } = {}): Observable<object> {
    const key = `interests:agg:${JSON.stringify(params)}`;
    return this.cachedGet(key, this.sendGetRequest('analytics/interests', params), 60_000);
  }

  getInterestExplainer(userId: string): Observable<object> {
    return this.cachedGet(
      `interests:explainer:${userId}`,
      this.sendGetRequest(`analytics/interest-explainer/${userId}`)
    );
  }
}
