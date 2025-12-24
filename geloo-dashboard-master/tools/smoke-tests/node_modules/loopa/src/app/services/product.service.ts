import { Router } from '@angular/router';
import { HTTP } from '@ionic-native/http/ngx';import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { DataService } from './data.service';
import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class ProductService extends DataService {

  constructor(nativeStorage: NativeStorage, http: HTTP, httpClient: HttpClient, router: Router, platform: Platform) {
    super('product', nativeStorage, http, httpClient, router, platform);
  }

  store(data){
    return this.sendRequest({
      method: 'post',
      url: '',
      data,
      serializer: 'multipart'
    });
  }

  posted(page: number, query: string){
    return this.sendRequest({
      method: 'get',
      url: '/posted',
      data: {page: page.toString(), search: query}
    });
  }

  available(page: number, query: string, category: string) {
    return this.sendRequest({
      method: 'get',
      url: '/available',
      data: { 
        page: page.toString(), 
        search: query, 
        category: category  // Pass the selected category to the backend
      }
    });
  }
  

  get(id: string){
    return this.sendRequest({
      method: 'get',
      url: '/' + id
    });
  }

  getStorePermession(){
    return this.sendRequest({
      method: 'get',
      url: '/storePermession'
    });
  }

  update(id: string, data: any) {
    return this.sendRequest({
      method: 'put',
      url: '/' + id,
      data,
      serializer: 'multipart'

    });
  }

  remove(id: string){
    return this.sendRequest({
      method: 'delete',
      url: '/' + id
    })
  }

  sold(id: string){
    return this.sendRequest({
      method: 'post',
      url: '/sold/' + id
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
