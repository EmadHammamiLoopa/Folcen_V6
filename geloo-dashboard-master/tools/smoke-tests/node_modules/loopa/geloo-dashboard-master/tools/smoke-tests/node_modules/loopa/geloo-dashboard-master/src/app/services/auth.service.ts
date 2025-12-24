import { HttpClient } from '@angular/common/http';
import { DataService } from './data.service';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService extends DataService {

  constructor(http: HttpClient) {
    super(http);
  }

  signin(data: any): Observable<object>{
    return this.sendPostRequest('auth/signin', data);
  }

  signout(): Observable<object>{
    return this.sendPostRequest('auth/signout', {});
  }
}
