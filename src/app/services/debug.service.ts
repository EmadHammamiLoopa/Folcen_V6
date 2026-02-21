import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class DebugService {
  
  /**
   * Safe object logger that prevents [object Object]
   * Always use this instead of console.log for objects
   */
  logObject(label: string, obj: any) {
    const env = environment.production ? '🔴 PROD' : '🟢 DEV';
    
    if (!obj) {
      console.log(`${env} [${label}]:`, obj);
      return;
    }

    // Log multiple representations
    console.group(`${env} [${label}]`);
    console.log('Type:', typeof obj);
    console.log('Value:', obj);
    console.log('JSON:', JSON.stringify(obj, null, 2));
    console.log('Keys:', obj && typeof obj === 'object' ? Object.keys(obj) : 'N/A');
    console.groupEnd();
  }

  /**
   * Log API call details
   */
  logApiCall(method: string, url: string, data?: any) {
    const env = environment.production ? '🔴 PROD' : '🟢 DEV';
    console.group(`${env} [API ${method}] ${url}`);
    console.log('Full URL:', url);
    console.log('Base API:', environment.apiUrl);
    console.log('Token exists:', !!localStorage.getItem('token'));
    if (data) console.log('Payload:', data);
    console.groupEnd();
  }

  /**
   * Log API response
   */
  logApiResponse(url: string, response: any, error?: any) {
    const env = environment.production ? '🔴 PROD' : '🟢 DEV';
    
    if (error) {
      console.group(`${env} ❌ [API Error] ${url}`);
      console.log('Status:', error.status);
      console.log('Message:', error.message);
      console.log('Error body:', error.error);
      console.groupEnd();
      return;
    }

    console.group(`${env} ✅ [API Success] ${url}`);
    console.log('Response type:', typeof response);
    console.log('Response:', response);
    if (response && typeof response === 'object') {
      console.log('Keys:', Object.keys(response));
      console.log('Has .data?:', 'data' in response);
      console.log('Has .user?:', 'user' in response);
    }
    console.groupEnd();
  }

  /**
   * Check and log environment configuration
   */
  checkEnvironment() {
    console.group('🔍 Environment Check');
    console.log('Production mode:', environment.production);
    console.log('API URL:', environment.apiUrl);
    console.log('Socket URL:', environment.socketUrl);
    console.log('Current domain:', window.location.origin);
    console.log('Token stored:', !!localStorage.getItem('token'));
    console.log('User stored:', !!localStorage.getItem('currentUser'));
    console.groupEnd();
  }
}
