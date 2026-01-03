import { Injectable, Inject, Optional } from '@angular/core';
import { Router } from '@angular/router';
import { HTTP } from '@ionic-native/http/ngx';import { HttpClient } from '@angular/common/http';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { Platform } from '@ionic/angular';
import { SessionStoreService } from './session-store.service';
import { SocketService } from './socket.service';
import { UserService } from './user.service';
import constants from './../helpers/constants';

type HttpMethod = 'get' | 'post' | 'put' | 'delete';
type HttpSerializer = 'json' | 'urlencoded' | 'utf8' | 'multipart' | 'raw';
type RequestOptions = {
  method: HttpMethod,
  url: string,
  data?: any,
  params?: any, // Add this line

  header?: any,
  serializer?: HttpSerializer,
  noApi?: boolean
};

@Injectable({
  providedIn: 'root'
})
export class DataService {
  constructor(
    @Optional() @Inject('string') private url: string,
    private nativeStorage: NativeStorage,
    private http: HTTP,
    private httpClient: HttpClient,
    private router: Router,
    public platform: Platform,
    @Optional() private sessionStore?: SessionStoreService
  ) {}

  getToken() {
    return this.platform.is('cordova')
      ? this.nativeStorage.getItem('token').catch(() => '')
      : Promise.resolve(localStorage.getItem('token'));
  }

  sendRequest(requestOptions: RequestOptions) {
    return this.getToken().then((token: string) => {
      const base = this.url || '';
      const url = constants.DOMAIN_URL + (requestOptions.noApi ? '' : constants.API_V1) + base + requestOptions.url;
      console.log('ssssssssssssssssssssssssssssss request to URL:', url); // Print the URL to the console

      const headers = {
        ...(requestOptions.header || {}),
        VERSION: constants.VERSION,
        'Authorization': 'Bearer ' + token
      };

      // Use browser (HttpClient) for multipart even on cordova, as native HTTP doesn't handle FormData well
      return (this.platform.is('cordova') && requestOptions.serializer !== 'multipart')
        ? this.cordovaHttpRequest(url, requestOptions, headers)
        : this.browserHttpRequest(url, requestOptions, headers);
    });
  }

  private cordovaHttpRequest(url: string, requestOptions: RequestOptions, headers: any) {
    const options = {
      method: requestOptions.method,
      params: requestOptions.method === 'get' && requestOptions.data ? requestOptions.data : {},
      data: ['post', 'put'].includes(requestOptions.method) && requestOptions.data ? requestOptions.data : {},
      headers,
      serializer: requestOptions.serializer || 'json'
    };

    return this.http.sendRequest(url, options)
      .then(resp => JSON.parse(resp.data))
      .catch(err => this.handleError(err));
  }

  private browserHttpRequest(url: string, requestOptions: RequestOptions, headers: any) {
    let request;
    switch (requestOptions.method) {
      case 'post': request = this.httpClient.post(url, requestOptions.data, { headers }); break;
      case 'get': request = this.httpClient.get(url, { headers, params: requestOptions.data }); break;
      case 'put': request = this.httpClient.put(url, requestOptions.data, { headers }); break;
      case 'delete': request = this.httpClient.delete(url, { headers }); break;
      default: throw new Error('Unsupported HTTP method');
    }

    return request.toPromise().catch(err => this.handleError(err));
  }

  private handleError(err: any) {
    console.error('HTTP error', err);
    if (err.status === 401) {
      // If we are already on the auth page, don't trigger a logout redirect loop,
      // but we still want to reject so the signin component can show "Invalid credentials".
      const isAuthPage = this.router.url.includes('/auth');
      if (!isAuthPage) {
        this.logout();
      }
    }
    return Promise.reject(err);
  }

  async logout() {
    try {
      console.log('Performing full logout and state reset...');
      
      // 1. Clear all persistence
      try { await this.nativeStorage.clear(); } catch (e) { console.warn('NativeStorage clear failed', e); }
      try { localStorage.clear(); } catch (e) { console.warn('localStorage clear failed', e); }
      try { sessionStorage.clear(); } catch (e) { console.warn('sessionStorage clear failed', e); }
      
      // 2. Clear cookies
      document.cookie = 'token=; Max-Age=0; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';

      // 3. Clear session store caches & observable state
      try { this.sessionStore?.clear('logout'); } catch (e) { console.warn('SessionStore clear failed', e); }

      // 4. Disconnect socket and reset socket static state
      try { await SocketService.logout(); } catch (e) { console.warn('SocketService logout failed', e); }

      // 5. Clear user service state
      try { UserService.clearUserState(); } catch (e) { console.warn('UserService clear failed', e); }

      // 6. Clear any other known caches (e.g. PeerJS)
      if ((window as any).peer) {
        try { (window as any).peer.destroy(); } catch (e) {}
      }

    } catch (err) {
      console.error('Error during logout process:', err);
    } finally {
      // Always navigate to auth screen
      this.router.navigateByUrl('/auth', { replaceUrl: true });
    }
  }

  getItem(key: string) {
    return this.nativeStorage.getItem(key);
  }

  setItem(key: string, value: any) {
    return this.nativeStorage.setItem(key, value);
  }
  
}
