/**
 * one-signal.service.ts
 *
 * This service now delegates to FcmPushService.
 * All existing injection sites (app.component.ts, signin, etc.) are
 * preserved — no component changes required.
 */
import { Injectable } from '@angular/core';
import { FcmPushService } from './fcm-push.service';

@Injectable({
  providedIn: 'root'
})
export class OneSignalService {
  // FcmPushService is injected by Angular DI (both are providedIn: 'root')
  constructor(private fcm: FcmPushService) {}

  open(user_id: string): void {
    this.fcm.open(user_id).catch(err =>
      console.error('[OneSignalService→FCM] open error', err)
    );
  }

  close(): void {
    this.fcm.close().catch(err =>
      console.error('[OneSignalService→FCM] close error', err)
    );
  }
}
