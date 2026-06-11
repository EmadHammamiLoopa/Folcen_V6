import { Injectable, NgZone } from '@angular/core';

declare const gapi: any;

@Injectable({
  providedIn: 'root'
})
export class GoogleAuthService {
  constructor(private ngZone: NgZone) {
    gapi.load('auth2', () => {
      gapi.auth2.init({
        client_id: '309126815402-vnscbcqta4nluub7mviotq9c3ahf4605.apps.googleusercontent.com',
        cookiepolicy: 'single_host_origin',
      }).then(() => {
        console.log('Google Auth initialized');
      });
    });
  }
}
