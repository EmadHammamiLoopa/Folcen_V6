import { devLogger } from "../utils/dev-logger";
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { HTTP } from '@ionic-native/http/ngx';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { Platform } from '@ionic/angular';
import { HttpClient } from '@angular/common/http';
import { DataService } from './data.service';
import { lastValueFrom, from, Observable, of } from 'rxjs';
import { shareReplay, finalize } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

@Injectable({
  providedIn: 'root'
})
export class JsonService extends DataService {

  // Simple TTL cache and in-flight dedupe for static JSON loads
  private cache = new Map<string, { value: any; expires: number }>();
  private inflight = new Map<string, Observable<any>>();
  private defaultTTLms = 60 * 60 * 1000; // 1 hour

  constructor(nativeStorage: NativeStorage, http: HTTP, httpClient: HttpClient, router: Router, platform: Platform, private metrics: MetricsService) {
    super('', nativeStorage, http, httpClient, router, platform);
  }

  /**
   * Fetch a JSON file once with cache + in-flight dedupe.
   * Uses DataService.sendRequest to preserve platform-specific behavior.
   */
  private async getJsonOnce(path: string, opts: { ttlMs?: number; storageKey?: string; metricKey?: keyof ReturnType<MetricsService['getAll']> } = {}): Promise<any> {
    const ttl = opts.ttlMs ?? this.defaultTTLms;
    const key = path;
    const now = Date.now();

    const cached = this.cache.get(key);
    if (cached && cached.expires > now) {
      return cached.value;
    }

    if (this.inflight.has(key)) {
      try {
        return await lastValueFrom(this.inflight.get(key));
      } catch (e) {
        this.inflight.delete(key);
        throw e;
      }
    }

    const req$ = from(this.sendRequest({ method: 'get', url: path, noApi: true })).pipe(
      shareReplay(1),
      finalize(() => {
        this.inflight.delete(key);
      })
    );

    this.inflight.set(key, req$);
    try {
      const resp = await lastValueFrom(req$);
      // Return raw response (could be array or object)
      const value = resp;
      this.cache.set(key, { value, expires: Date.now() + ttl });
      if (opts.storageKey) {
        try { await this.setItem(opts.storageKey, JSON.stringify(value)); } catch (_) {}
      }
      if (opts.metricKey) {
        try { this.metrics.inc(opts.metricKey as any); } catch (_) {}
      }
      return value;
    } catch (err) {
      devLogger.error('Failed to load static JSON:', path, err);
      return null;
    }
  }

  async getCountries() {
    return this.getJsonOnce('/json/countries.json', { ttlMs: this.defaultTTLms, storageKey: 'countries', metricKey: 'staticJsonCountries' });
  }

  async getCurrencies() {
    return this.getJsonOnce('/json/currencies.json', { ttlMs: this.defaultTTLms, metricKey: 'staticJsonCurrencies' });
  }

  async getProfessions() {
    return this.getJsonOnce('/json/professions.json', { ttlMs: this.defaultTTLms, metricKey: 'staticJsonProfessions' });
  }

  async getInterests() {
    return this.getJsonOnce('/json/interests.json', { ttlMs: this.defaultTTLms, metricKey: 'staticJsonInterests' });
  }

  async getEducations() {
    return this.getJsonOnce('/json/education.json', { ttlMs: this.defaultTTLms, metricKey: 'staticJsonEducations' });
  }
}
