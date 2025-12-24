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
        if (token) {
          console.log('Auth token found, redirecting to /tabs/new-friends:', token);
          this.router.navigate(['/tabs/new-friends']);
          return false; // Prevent access to guest routes
        } else {
          console.log('Auth token not found, allowing access to guest routes');
          return true; // Allow access to guest routes
        }
      }

      // Running on a Cordova platform
      return this.nativeStorage.getItem('token')
        .then(
          token => {
            if (token) {
              console.log('Auth token found, redirecting to /tabs/new-friends:', token);
              this.router.navigate(['/tabs/new-friends']);
              return false; // Prevent access to guest routes
            } else {
              console.log('Auth token not found, allowing access to guest routes');
              return true; // Allow access to guest routes
            }
          },
          err => {
            console.log('Auth token not found, allowing access to guest routes', err);
            return true; // Allow access to guest routes in case of an error
          }
        );
    });
  }
}
