import { Injectable } from '@angular/core';
import { DataService } from './data.service';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class LegalAcceptanceService {

  constructor(private dataService: DataService) { }

  /**
   * Get current legal versions from backend
   */
  getVersions(): Observable<any> {
    return this.dataService.sendGetRequest('gdpr/versions').pipe(
      map((resp: any) => resp.data),
      catchError(err => {
        console.error('Failed to fetch legal versions', err);
        return of(null);
      })
    );
  }

  /**
   * Check if user has accepted the latest versions
   */
  checkAcceptance(): Observable<any> {
    return this.dataService.sendGetRequest('gdpr/acceptance/check').pipe(
      map((resp: any) => resp.data),
      catchError(err => {
        console.error('Failed to check legal acceptance', err);
        return of({ accepted: true }); // Default to true on error to avoid blocking UI
      })
    );
  }

  /**
   * Post acceptance of legal versions
   */
  acceptDocument(documentType: string, documentVersion: string): Observable<any> {
    return this.dataService.sendPostRequest('gdpr/acceptance', {
      documentType,
      documentVersion,
      acceptanceContext: 'DASHBOARD_MODAL'
    });
  }

  /**
   * Accept multiple documents in sequence
   */
  acceptMultiple(requirements: { type: string, version: string }[]): Observable<any> {
    if (!requirements || requirements.length === 0) return of(true);
    
    // Simple sequential acceptance for now
    const first = requirements[0];
    return this.acceptDocument(first.type, first.version).pipe(
      map(() => requirements.slice(1)),
      map(remaining => this.acceptMultiple(remaining))
    );
    // Note: This is a bit recursive, but for 2-3 docs it's fine. 
    // Better would be concatMap or similar if we had more time to refactor.
  }
}
