import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SubscriptionService {
  private apiUrl = `${environment.apiUrl}/subscription`;

  constructor(private http: HttpClient) {}

  getSubscriptionById(subscriptionId: string): Observable<any> {
    const token = localStorage.getItem('token'); // Retrieve the token
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    console.log('Sending GET request:');
    console.log('URL:', `${this.apiUrl}/${subscriptionId}`);
    console.log('Headers:', headers);

    
    return this.http.get(`${this.apiUrl}/${subscriptionId}`, { headers });
  }
  

  enableSubscription(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/status`, { enabled: true });
  }

  disableSubscription(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/status`, { enabled: false });
  }

  approveSubscription(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/approvement`, { approved: true });
  }

  declineSubscription(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/approvement`, { approved: false });
  }

  deleteSubscription(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}
