import { Injectable } from '@angular/core';
import { DataService } from './data.service';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { HTTP } from '@ionic-native/http/ngx';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Platform } from '@ionic/angular';

@Injectable({ providedIn: 'root' })
export class AdminService extends DataService {
  constructor(
    nativeStorage: NativeStorage,
    http: HTTP,
    httpClient: HttpClient,
    router: Router,
    platform: Platform
  ) {
    super('admin/', nativeStorage, http, httpClient, router, platform);
  }

  // GET /api/v1/admin/auth-events/overview
  getAuthOverview() {
    return this.sendRequest({ method: 'get', url: 'auth-events/overview' });
  }

  // GET /api/v1/admin/auth-events/recent with optional filters
  // options: { limit, skip, type, from, to, q }
  getAuthRecent(options: any = {}) {
    const params: any = {
      limit: options.limit || 50,
      skip: options.skip || 0,
    };
    if (options.type) params.type = options.type;
    if (options.from) params.from = options.from;
    if (options.to) params.to = options.to;
    if (options.q) params.q = options.q;
    return this.sendRequest({ method: 'get', url: `auth-events/recent`, data: params });
  }
}
