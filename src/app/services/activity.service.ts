import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ActivityService {
  private base = `${environment.apiUrl}/activity`;
  constructor(private http: HttpClient) {}

  getActivities(params: any = {}){
    return this.http.get(this.base, { params });
  }

  createActivity(payload: any){
    return this.http.post(this.base, payload);
  }
}
