import { Injectable } from '@angular/core';
import { Observable, of, EMPTY } from 'rxjs';
import { tap, expand, map, reduce } from 'rxjs/operators';
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

  /**
   * Dashboard/full-file helper.
   *
   * The backend intentionally caps each portability page at 100 rows per
   * collection. Follow paginationManifest/nextPage until the backend marks
   * the export complete, then merge all page-level arrays.
   */
  exportUserDataAll(userId: string): Observable<object> {
    return this.exportUserData(userId, 1).pipe(
      expand((response: any) => {
        const page =
          response && response.data
            ? response.data
            : response;

        if (
          !page ||
          page.complete === true ||
          page.hasMore !== true ||
          !page.nextPage
        ) {
          return EMPTY;
        }

        return this.exportUserData(
          userId,
          Number(page.nextPage)
        );
      }),

      map((response: any) =>
        response && response.data
          ? response.data
          : response
      ),

      reduce(
        (pages: any[], page: any) => {
          pages.push(page);
          return pages;
        },
        []
      ),

      map((pages: any[]) =>
        this.mergePortabilityPages(pages)
      )
    );
  }

  private mergePortabilityPages(pages: any[]): any {
    if (!pages || pages.length === 0) {
      return {};
    }

    // HTTP responses contain plain JSON-compatible values.
    const merged =
      JSON.parse(
        JSON.stringify(pages[0])
      );

    const topLevelArrays = [
      'posts',
      'comments',
      'messages',
      'followers',
      'following',
      'callEvents',
      'messageEvents',
      'activities',
      'reports',
      'products',
      'jobs',
      'services',
      'channels',
      'notifications',
      'requests',
      'analyticsEvents',
      'dailyActivity',
      'subscriptions',
      'legalAcceptances'
    ];

    const mergeArrayContainer =
      (target: any, source: any) => {
        if (!target || !source) return;

        Object.keys(source).forEach(key => {
          if (!Array.isArray(source[key])) {
            return;
          }

          if (!Array.isArray(target[key])) {
            target[key] = [];
          }

          target[key] =
            target[key].concat(
              source[key]
            );
        });
      };

    for (
      let index = 1;
      index < pages.length;
      index++
    ) {
      const page =
        pages[index] || {};

      topLevelArrays.forEach(key => {
        if (!Array.isArray(page[key])) {
          return;
        }

        if (!Array.isArray(merged[key])) {
          merged[key] = [];
        }

        merged[key] =
          merged[key].concat(
            page[key]
          );
      });

      mergeArrayContainer(
        merged.portableData,
        page.portableData
      );

      mergeArrayContainer(
        merged.supplementary,
        page.supplementary
      );
    }

    const lastPage =
      pages[
        pages.length - 1
      ] || {};

    /*
     * Backend page.complete intentionally means:
     * "this individual page is a complete export".
     *
     * Therefore page 2+ of a valid multi-page export remains
     * complete=false even when it is the terminal page.
     *
     * For the dashboard's AGGREGATED export, completion means
     * that we followed pagination until the server explicitly
     * reported no further page.
     */
    const complete =
      lastPage.hasMore === false &&
      (
        lastPage.nextPage === null ||
        lastPage.nextPage === undefined
      );

    merged.complete =
      complete;

    merged.hasMore =
      !complete;

    merged.nextPage =
      complete
        ? null
        : lastPage.nextPage;

    merged.page =
      1;

    merged.dashboardAggregation = {
      pagesFetched:
        pages.length,

      complete,

      totals:
        merged.totals || {}
    };

    merged.paginationManifest = {
      totals:
        merged.totals || {},

      pagesFetched:
        pages.length,

      complete,

      hasMore:
        !complete,

      nextPage:
        complete
          ? null
          : lastPage.nextPage,

      dashboardAggregated:
        true
    };

    return merged;
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
