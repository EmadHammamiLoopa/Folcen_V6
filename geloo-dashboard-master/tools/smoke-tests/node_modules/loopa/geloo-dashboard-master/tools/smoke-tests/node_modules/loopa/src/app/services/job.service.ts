import { Router } from '@angular/router';
import { HTTP } from '@ionic-native/http/ngx';import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { DataService } from './data.service';
import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class JobService extends DataService {

  constructor(
    nativeStorage: NativeStorage, 
    http: HTTP, 
    router: Router, 
    platform: Platform,
    httpClient: HttpClient
  ) {
      super('job', nativeStorage, http, httpClient, router, platform);
    }

  store(data: any) {
    return this.sendRequest({
      method: 'post',
      url: '', // Assuming 'job' is the endpoint
      data,
      serializer: 'multipart'
    });
  }

  available(page: number, query: string) {
    return this.sendRequest({
      method: 'get',
      url: '/available', // Assuming 'job/available' is the endpoint
      data: { page: page.toString(), search: query }
    });
  }

  posted(page: number, query: string) {
    return this.sendRequest({
      method: 'get',
      url: '/posted', // Assuming 'job/posted' is the endpoint
      data: { page: page.toString(), search: query }
    });
  }

  get(id: string) {
    return this.sendRequest({
      method: 'get',
      url: '/' + id // Assuming 'job/:id' is the endpoint
    });
  }

  getStorePermession() {
    return this.sendRequest({
      method: 'get',
      url: '/storePermession' // Assuming 'job/storePermession' is the endpoint
    });
  }

  remove(id: string) {
    return this.sendRequest({
      method: 'delete',
      url: '/' + id // Assuming 'job/:id' is the endpoint
    });
  }

  report(id: string, message: string) {
    return this.sendRequest({
      method: 'post',
      url: '/' + id + '/report', // Assuming 'job/:id/report' is the endpoint
      data: { message }
    });
  }
}
