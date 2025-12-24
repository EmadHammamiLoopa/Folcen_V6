import { HttpClient } from '@angular/common/http';
import { DataService } from './data.service';
import { Injectable } from '@angular/core';
import constants from '../constants/constants';

@Injectable({
  providedIn: 'root'
})
export class JsonService extends DataService {

  constructor(http: HttpClient) {
    super(http);
  }

  getCurrencies(){
    return this.sendGetRequest('http://127.0.0.1:3300/json/currencies.json', {}, false);
  }
  getCountries(){
    return this.sendGetRequest('http://127.0.0.1:3300/json/countries.json', {}, false);
  }
  getEducation(){
    return this.sendGetRequest('http://127.0.0.1:3300/json/education.json', {}, false);
  }
  getProfessions(){
    return this.sendGetRequest('http://127.0.0.1:3300/json/professions.json', {}, false);
  }
  getInterests(){
    return this.sendGetRequest('http://127.0.0.1:3300/json/interests.json', {}, false);
  }
}
