import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class OneSignalService {
  private isCordova: boolean;

  constructor(private router: Router, private platform: Platform) {
    this.isCordova = this.platform.is('cordova');
  }

  open(user_id: string) {
    if (this.isCordova) {
      this.initializeOneSignal(user_id);
    } else {
      this.mockOpen(user_id);
    }
  }

  close() {
    if (this.isCordova) {
      this.terminateOneSignal();
    } else {
      this.mockClose();
    }
  }

  private initializeOneSignal(user_id: string) {
    console.log(`Initializing OneSignal with user ID: ${user_id}`);
    (window as any).plugins.OneSignal.startInit("747cfdfa-7570-46eb-a2ba-64682c01a3e9", "MWRjNTcxYWItNGQzZS00N2UwLWJkMGYtYmQxZjFmYTI4MWY5");
    (window as any).plugins.OneSignal.inFocusDisplaying((window as any).plugins.OneSignal.OSInFocusDisplayOption.Notification);
    (window as any).plugins.OneSignal.setExternalUserId(user_id);
    (window as any).plugins.OneSignal.setSubscription(true);
    (window as any).plugins.OneSignal.handleNotificationOpened().subscribe(resp => {
      this.platform.ready().then(() => {
        setTimeout(() => {
          const data = resp.notification.payload.additionalData;
          if (data.link) {
            this.router.navigateByUrl(data.link);
          }
        }, 200);
      });
    });
    (window as any).plugins.OneSignal.handleNotificationReceived().subscribe(resp => {
      console.log('Notification received:', resp);
    });
    (window as any).plugins.OneSignal.endInit();
  }

  private terminateOneSignal() {
    console.log('Terminating OneSignal');
    (window as any).plugins.OneSignal.removeExternalUserId();
    (window as any).plugins.OneSignal.setSubscription(false);
  }

  private mockOpen(user_id: string) {
    console.log(`Mock open with user ID: ${user_id}`);
  }

  private mockClose() {
    console.log('Mock close OneSignal');
  }
}
