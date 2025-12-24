import { Injectable } from '@angular/core';
import { DataService } from './data.service';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { HTTP } from '@ionic-native/http/ngx';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Platform } from '@ionic/angular';

@Injectable({ providedIn: 'root' })
export class LegalService extends DataService {
  constructor(
    nativeStorage: NativeStorage,
    http: HTTP,
    httpClient: HttpClient,
    router: Router,
    platform: Platform
  ) {
    super('gdpr/', nativeStorage, http, httpClient, router, platform);
  }

  recordAcceptance(payload: { documentType: string; documentVersion: string; acceptanceContext?: string; meta?: any }) {
    return this.sendRequest({ method: 'post', url: 'acceptance', data: payload });
  }

  getAcceptancesForUser(userId: string) {
    return this.sendRequest({ method: 'get', url: 'acceptances', data: { userId } });
  }

  // Admin: fetch recent non-content events (call/message events)
  getEvents(limit: number = 100) {
    return this.sendRequest({ method: 'get', url: 'events', data: { limit } });
  }
}
