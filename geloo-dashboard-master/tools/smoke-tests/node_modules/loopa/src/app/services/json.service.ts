import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { HTTP } from '@ionic-native/http/ngx';import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { Platform } from '@ionic/angular';
import { HttpClient } from '@angular/common/http';
import { DataService } from './data.service';
import { lastValueFrom, from } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class JsonService extends DataService {

  constructor(nativeStorage: NativeStorage, http: HTTP, httpClient: HttpClient, router: Router, platform: Platform) {
    super('', nativeStorage, http, httpClient, router, platform);
  }

  async getCountries() {
    try {
      const resp = await lastValueFrom(from(this.sendRequest({
        method: 'get',
        url: '/json/countries.json',
        noApi: true
      })));
      await this.setItem('countries', JSON.stringify(resp)); // Use the new setItem method
      return resp || [];  // Return empty array if response is null or undefined
    } catch (err) {
      console.error('Failed to load countries:', err);
      return [];
    }
  }

  async getCurrencies() {
    try {
      const resp = await lastValueFrom(from(this.sendRequest({
        method: 'get',
        url: '/json/currencies.json',
        noApi: true
      })));
      return resp || [];  // Return empty array if response is null or undefined
    } catch (err) {
      console.error('Failed to load currencies:', err);
      return [];
    }
  }

  async getProfessions() {
    try {
      const resp = await lastValueFrom(from(this.sendRequest({
        method: 'get',
        url: '/json/professions.json',
        noApi: true
      })));
      return resp || [];  // Return empty array if response is null or undefined
    } catch (err) {
      console.error('Failed to load professions:', err);
      return [];
    }
  }

  async getInterests() {
    try {
      const resp = await lastValueFrom(from(this.sendRequest({
        method: 'get',
        url: '/json/interests.json',
        noApi: true
      })));
      return resp || [];  // Return empty array if response is null or undefined
    } catch (err) {
      console.error('Failed to load interests:', err);
      return [];
    }
  }

  async getEducations() {
    try {
      const resp = await lastValueFrom(from(this.sendRequest({
        method: 'get',
        url: '/json/education.json',
        noApi: true
      })));
      return resp || [];  // Return empty array if response is null or undefined
    } catch (err) {
      console.error('Failed to load educations:', err);
      return [];
    }
  }
}
