import { Injectable } from '@angular/core';
import { DataService } from './data.service';

@Injectable({
  providedIn: 'root'
})
export class GdprConsentService {

  constructor(
    private dataService: DataService
  ) {}

  /**
   * Read the authenticated user's current optional analytics choice.
   * No userId is supplied: the backend resolves the data subject from
   * the authenticated session.
   */
  getStatus(): Promise<any> {
    return this.dataService.sendRequest({
      method: 'get',
      url: 'gdpr/consent-status'
    });
  }

  /**
   * Explicit self-service consent action.
   *
   * true  = the authenticated data subject actively opts in.
   * false = the authenticated data subject withdraws consent.
   */
  setAnalyticsConsent(value: boolean): Promise<any> {
    return this.dataService.sendRequest({
      method: 'put',
      url: 'gdpr/consent',
      data: {
        key: 'analytics_optin',
        value
      }
    });
  }
}
