import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { HTTP } from '@ionic-native/http/ngx';import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { DataService } from './data.service';
import { Platform } from '@ionic/angular';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class SubscriptionService extends DataService {

  constructor(nativeStorage: NativeStorage, http: HTTP, httpClient: HttpClient, router: Router, platform: Platform) {
    super('subscription', nativeStorage, http, httpClient, router, platform);
  }

  getSubscriptionPrices(){
    return this.sendRequest({
      method: 'get',
      url: '/prices'
    })
  }

  pay(id: string, data: any){
    return this.sendRequest({
      method: 'post',
      url: '/' + id + '/pay',
      data
    })
  }

  getClientSecret(id: string, data: any){
    return this.sendRequest({
      method: 'post',
      url: '/' + id + '/client-secret',
      data
    })
  }

  subscribe(id: string, data: any){
    return this.sendRequest({
      method: 'post',
      url: '/' + id + '/subscribe',
      data
    })
  }

}
