import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { Platform } from '@ionic/angular';
import { NativeStorage } from '@ionic-native/native-storage/ngx';

@Injectable({
  providedIn: 'root'
})
export class GuestGuard implements CanActivate {
  constructor(
    private nativeStorage: NativeStorage,
    private router: Router,
    private platform: Platform
  ) {}

  canActivate(): Promise<boolean> {
    return this.platform.ready().then(() => {
      if (!this.platform.is('cordova')) {
        // Running in a browser
        const token = localStorage.getItem('token');
        const user = localStorage.getItem('currentUser') || localStorage.getItem('user');
        if (token && user) {
          console.log('Auth token and user found, redirecting to /tabs/new-friends');
          this.router.navigate(['/tabs/new-friends']);
          return false; // Prevent access to guest routes
        } else {
          console.log('Auth token or user not found, allowing access to guest routes');
          return true; // Allow access to guest routes
        }
      }

      // Running on a Cordova platform
      return Promise.all([
        this.nativeStorage.getItem('token').catch(() => null),
        this.nativeStorage.getItem('currentUser').catch(() => this.nativeStorage.getItem('user').catch(() => null))
      ]).then(([token, user]) => {
        if (token && user) {
          console.log('Auth token and user found, redirecting to /tabs/new-friends');
          this.router.navigate(['/tabs/new-friends']);
          return false; // Prevent access to guest routes
        } else {
          console.log('Auth token or user not found, allowing access to guest routes');
          return true; // Allow access to guest routes
        }
      });
    });
  }
}
