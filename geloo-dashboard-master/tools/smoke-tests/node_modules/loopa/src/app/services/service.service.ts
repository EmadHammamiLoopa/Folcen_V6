import { Router } from '@angular/router';
import { DataService } from './data.service';
import { HTTP } from '@ionic-native/http/ngx';import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class ServiceService extends DataService {

  constructor(nativeStorage: NativeStorage, http: HTTP, httpClient: HttpClient, router: Router, platform: Platform) {
    super('service', nativeStorage, http, httpClient, router, platform);
  }

  store(data){
    return this.sendRequest({
      method: 'post',
      url: '',
      data,
      serializer: 'multipart'
    });
  }

  available(page: number, query: string){
    return this.sendRequest({
      method: 'get',
      url: '/available',
      data: {page: page.toString(), search: query}
    });
  }


  getStorePermession(){
    return this.sendRequest({
      method: 'get',
      url: '/storePermession'
    });
  }

  posted(page: number, query: string){
    return this.sendRequest({
      method: 'get',
      url: '/posted',
      data: {page: page.toString(), search: query}
    });
  }

  get(id: string){
    return this.sendRequest({
      method: 'get',
      url: '/' + id
    });
  }

  remove(id: string){
    return this.sendRequest({
      method: 'delete',
      url: '/' + id
    })
  }


  report(id: string, message: string){
    return this.sendRequest({
      method: 'post',
      url: '/' + id + '/report',
      data: {message}
    })
  }

}
