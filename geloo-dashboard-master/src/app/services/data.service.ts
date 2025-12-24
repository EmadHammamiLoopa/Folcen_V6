import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment'; // Ensure the path is correctly adjusted for your project structure
import { catchError } from 'rxjs/operators';
import { throwError, of } from 'rxjs';
import { HttpParams } from '@angular/common/http';

type RequestMethod = 'get' | 'post' | 'delete' | 'put';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private apiUrl = environment.apiUrl;

  constructor(protected http: HttpClient) { }

  private header(): HttpHeaders {
    const token = window.localStorage.getItem('token');
    return token ? new HttpHeaders({
      Authorization: 'Bearer ' + token
    }) : new HttpHeaders();
  }

  public sendGetRequest(url: string, params?: any, useApiPrefix: boolean = true): Observable<object> {
    const fullUrl = useApiPrefix ? `${this.apiUrl}/${url}` : url;
    console.log('[DataService] GET', fullUrl, 'params:', params);
    return this.http.get(fullUrl, { params, headers: this.header() }).pipe(
      catchError(err => {
        // Normalize network / ProgressEvent errors into a readable object
        if (err instanceof ProgressEvent) {
          console.error('[DataService] Network/ProgressEvent error', err);
          return throwError({ message: 'Network error or CORS issue', detail: err });
        }
        // HttpErrorResponse or other
        const msg = (err && err.error && err.error.message) || err.message || JSON.stringify(err);
        console.error('[DataService] HTTP error', { url: fullUrl, status: err.status, message: msg, body: err.error || err });
        return throwError({ message: msg, status: err.status, detail: err, url: fullUrl });
      })
    );
}



  public sendPostRequest(url: string, data: any): Observable<object> {
    return this.http.post(`${this.apiUrl}/${url}`, data, { headers: this.header() })
      .pipe(
        catchError(error => {
          console.error('Error occurred during POST request:', error);
          return throwError(error);
        })
      );
  }

  public sendPutRequest(url: string, data: any): Observable<object> {
    return this.http.put(`${this.apiUrl}/${url}`, data, { headers: this.header() });
  }

  public sendDeleteRequest(url: string): Observable<object> {
    return this.http.delete(`${this.apiUrl}/${url}`, { headers: this.header() });
  }

  public sendRequest(method: RequestMethod, url: string, data?: any): Observable<object> {
    switch (method) {
      case 'get':
        return this.sendGetRequest(url, data);
      case 'post':
        return this.sendPostRequest(url, data);
      case 'delete':
        return this.sendDeleteRequest(url);
      case 'put':
        return this.sendPutRequest(url, data);
      default:
        throw new Error('Method not supported');
    }
  }
}
