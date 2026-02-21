import { devLogger } from "../utils/dev-logger";
import { Router } from '@angular/router';
import { HTTP } from '@ionic-native/http/ngx';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { DataService } from './data.service';
import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class MessageService extends DataService {

  // Per-thread request dedupe and lightweight caching
  private threadInflight = new Map<string, Map<number, Promise<any>>>();
  private threadCache = new Map<string, Map<number, { at: number; resp: any }>>();
  private cacheTTLms = 60 * 1000; // 1 minute
  private metrics = { pageRequests: 0, cacheHits: 0, inflightHits: 0 };

  constructor(nativeStorage: NativeStorage, http: HTTP, httpClient: HttpClient, router: Router, platform: Platform) {
    super('message', nativeStorage, http, httpClient, router, platform);
  }

  indexMessages(id: string, page: number) {
    const now = Date.now();
    const inflightForThread = this.threadInflight.get(id) || new Map();
    const cacheForThread = this.threadCache.get(id) || new Map();

    const cached = cacheForThread.get(page);
    if (cached && now - cached.at < this.cacheTTLms) {
      this.metrics.cacheHits += 1;
      return Promise.resolve(cached.resp);
    }

    const inflight = inflightForThread.get(page);
    if (inflight) {
      this.metrics.inflightHits += 1;
      return inflight;
    }

    this.metrics.pageRequests += 1;
    const req = this.sendRequest({
      method: 'get',
      url: '/' + id,
      params: { page: page.toString() }
    }).then((response) => {
      devLogger.log("📥 Raw message response from backend:", response);
      cacheForThread.set(page, { at: Date.now(), resp: response });
      this.threadCache.set(id, cacheForThread);
      return response;
    }).finally(() => {
      inflightForThread.delete(page);
      this.threadInflight.set(id, inflightForThread);
      (window as any).__messageMetrics = this.metrics;
    });

    inflightForThread.set(page, req);
    this.threadInflight.set(id, inflightForThread);
    return req;
  }
  

  usersMessages(page: number) {
    return this.sendRequest({
      method: 'get',
      url: '/users',
      params: { page: page.toString() } // Use `params` for query parameters
    });
  }

  getPermission(id: string) {
    return this.sendRequest({
      method: 'get',
      url: '/permission/' + id
    });
  }

  clearCaches(reason = 'manual') {
    devLogger.log(`🧹 Clearing message cache (${reason})`);
    this.threadInflight.clear();
    this.threadCache.clear();
  }

  clearCacheForThread(id: string) {
    if (!id) return;
    devLogger.log(`🧹 Clearing message cache for thread: ${id}`);
    this.threadCache.delete(id);
    this.threadInflight.delete(id);
  }

  deleteMessage(id: string) {
    return this.sendRequest({
      method: 'delete',
      url: '/' + id
    });
  }
}