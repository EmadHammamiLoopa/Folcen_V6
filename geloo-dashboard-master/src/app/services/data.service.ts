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
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', 'Bearer ' + token);
    }
    return headers;
  }

  private getFullUrl(url: string, useApiPrefix: boolean): string {
    if (!useApiPrefix) return url;
    // Ensure no double slashes
    const base = this.apiUrl.endsWith('/') ? this.apiUrl.slice(0, -1) : this.apiUrl;
    const path = url.startsWith('/') ? url.slice(1) : url;
    return `${base}/${path}`;
  }

  public sendGetRequest(url: string, params?: any, useApiPrefix: boolean = true): Observable<object> {
    const fullUrl = this.getFullUrl(url, useApiPrefix);
    console.log('[DataService] GET', fullUrl, 'params:', params);
    return this.http.get(fullUrl, { params, headers: this.header() }).pipe(
      catchError(err => this.handleError(err, fullUrl))
    );
  }

  public sendGetBlobRequest(url: string, params?: any): Observable<Blob> {
    const fullUrl = this.getFullUrl(url, true);

    return this.http.get(fullUrl, {
      params,
      headers: this.header(),
      responseType: 'blob'
    }).pipe(
      catchError(err => this.handleError(err, fullUrl))
    );
  }

  public sendPostRequest(url: string, data: any): Observable<object> {
    const fullUrl = this.getFullUrl(url, true);
    return this.http.post(fullUrl, data, { headers: this.header() })
      .pipe(
        catchError(err => this.handleError(err, fullUrl))
      );
  }

  public sendPutRequest(url: string, data: any): Observable<object> {
    const fullUrl = this.getFullUrl(url, true);
    return this.http.put(fullUrl, data, { headers: this.header() })
      .pipe(
        catchError(err => this.handleError(err, fullUrl))
      );
  }

  public sendDeleteRequest(url: string): Observable<object> {
    const fullUrl = this.getFullUrl(url, true);
    return this.http.delete(fullUrl, { headers: this.header() })
      .pipe(
        catchError(err => this.handleError(err, fullUrl))
      );
  }

  private handleError(err: any, url: string): Observable<never> {
    // Normalize network / ProgressEvent errors into a readable object
    if (err instanceof ProgressEvent) {
      console.error('[DataService] Network/ProgressEvent error', err);
      return throwError({ message: 'Network error or CORS issue', detail: err, url });
    }
    
    // HttpErrorResponse
    const msg = (err && err.error && (err.error.message || err.error.errors)) || err.message || JSON.stringify(err);
    const errorCode = err && err.error && err.error.errorCode;
    
    console.error('[DataService] HTTP error', { 
      url, 
      status: err.status, 
      message: msg, 
      errorCode,
      body: err.error || err 
    });

    return throwError({ 
      message: msg, 
      status: err.status, 
      errorCode,
      detail: err, 
      url 
    });
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
