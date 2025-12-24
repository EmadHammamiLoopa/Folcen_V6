import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { DataService } from './data.service';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class UserService extends DataService {

  constructor(http: HttpClient) {
    super(http);
  }

  allUsers(params = {}): Observable<object>{
    return this.sendGetRequest('user/all', params);
  }
}
