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
export class RequestService extends DataService {

  private inflightRequests = new Map<string, Promise<any>>();

  constructor(nativeStorage: NativeStorage, http: HTTP, httpClient: HttpClient, router: Router, platform: Platform) {
    super('request', nativeStorage, http, httpClient, router, platform);
  }

  request(id: string){
    return this.sendRequest({
      method: 'post',
      url: '/' + id
    })
  }

  async requests(page: number, forceRefresh = false) {
    const key = String(page ?? 0);
    if (forceRefresh) {
      this.invalidateRequestsCache();
    }
    if (this.inflightRequests.has(key)) {
      return this.inflightRequests.get(key);
    }

    const promise = (async () => {
      const token = await this.getToken();
      if (!token) {
        devLogger.warn("No token found, skipping request."); // ✅ Prevents request if user isn't logged in
        return null;
      }

      return this.sendRequest({
        method: 'get',
        url: '/requests',
        params: { page: page.toString() },
      });
    })();

    this.inflightRequests.set(key, promise);

    try {
      return await promise;
    } finally {
      this.inflightRequests.delete(key);
    }
  }

  invalidateRequestsCache() {
    this.inflightRequests.clear();
  }

  acceptRequest(id: string) {
    if (!id) {
      return Promise.reject('Invalid request ID');
    }
    this.invalidateRequestsCache();
    return this.sendRequest({
      method: 'post',
      url: '/accept/' + id
    });
  }
  
  cancelRequest(id: string) {
    if (!id) {
      return Promise.reject('Invalid request ID');
    }
    this.invalidateRequestsCache();
    return this.sendRequest({
      method: 'post',
      url: '/cancel/' + id
    });
  }


  rejectRequest(id: string){
    this.invalidateRequestsCache();
    return this.sendRequest({
      method: 'post',
      url: '/reject/' + id
    })
  }
}
