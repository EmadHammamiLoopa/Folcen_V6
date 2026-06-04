import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { environment } from '../../environments/environment';
import { LocalNotifications } from '@capacitor/local-notifications';

/**
 * FcmPushService
 *
 * Lightweight replacement for OneSignalService.
 * – On a real Android/iOS device: registers with FCM via Capacitor's
 *   PushNotifications plugin, then sends the token to the backend.
 * – In browser/dev mode: skips registration silently.
 *
 * Call  open(userId)  after login.
 * Call  close()       on logout (unregisters the current token).
 */
@Injectable({
  providedIn: 'root'
})
export class FcmPushService {

  private currentToken: string | null = null;
  private listenersAttached = false;
  private readonly apiBase = environment.apiUrl;

  constructor(
    private platform: Platform,
    private router: Router,
    private http: HttpClient
  ) {}

  /** Call after a successful login. */
  async open(userId: string): Promise<void> {
    const isNative =
      Capacitor.isNativePlatform() ||
      this.platform.is('capacitor') ||
      this.platform.is('cordova') ||
      (typeof window !== 'undefined' && 'cordova' in window);

    if (!isNative) {
      console.log('[FcmPushService] Browser mode — skipping FCM registration');
      return;
    }

    await this.platform.ready();

    if (this.currentToken) {
      await this.sendTokenToBackend(this.currentToken);
      return;
    }
    await this.registerFcm();
  }

  /** Call at logout to remove the token from the backend. */
  async close(): Promise<void> {
    if (!this.currentToken) return;
    try {
      await this.http
        .post(`${this.apiBase}/push/unregister`, { token: this.currentToken })
        .toPromise();
      console.log('[FcmPushService] Token unregistered');
    } catch (e) {
      console.warn('[FcmPushService] Unregister failed (token already gone?)', e);
    }
    this.currentToken = null;
  }

  // ──────────────────────── private ────────────────────────────────

  private async registerFcm(): Promise<void> {
    try {
      if (!this.listenersAttached) {
        PushNotifications.addListener('registration', async (tokenData) => {
          const token = tokenData.value;
          this.currentToken = token;
          console.log('[FcmPushService] FCM token received');
          await this.sendTokenToBackend(token);
        });

        PushNotifications.addListener('registrationError', (err) => {
          console.error('[FcmPushService] FCM registration error:', err);
        });

        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('[FcmPushService] Notification received in foreground:', notification.title);
          const data: any = notification.data || {};
          if (this.isCallNotification(data)) {
            LocalNotifications.schedule({
              notifications: [{
                id: Date.now() % 2147483647,
                title: notification.title || 'Incoming video call',
                body: notification.body || 'Tap to answer',
                extra: data
              }]
            }).catch(() => {});
          }
        });

        PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          const data: any = action.notification?.data || {};

          if (this.isCallNotification(data)) {
            const callerId = data.callerId || data.fromUserId;
            if (callerId) {
              this.platform.ready().then(() => {
                setTimeout(() => this.router.navigate(
                  ['/messages/video', callerId],
                  { queryParams: { answer: true, callId: data.callId || undefined } }
                ), 200);
              });
              return;
            }
          }

          if (data?.link) {
            this.platform.ready().then(() => {
              setTimeout(() => this.router.navigateByUrl(data.link), 200);
            });
          }

          const isAnnouncement =
            data?.type === 'announcement' ||
            data?.category === 'announcement' ||
            data?.kind === 'announcement' ||
            !!data?.announcementId;

          if (isAnnouncement) {
            try {
              window.dispatchEvent(new CustomEvent('announcement-notification-tapped', { detail: data }));
            } catch (_) {}
          }
        });

        this.listenersAttached = true;
      }

      // 1. Request permission
      let permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }
      if (permStatus.receive !== 'granted') {
        console.warn('[FcmPushService] Push permission denied');
        return;
      }

      // 2. Register with FCM
      await PushNotifications.register();

    } catch (err) {
      console.error('[FcmPushService] registerFcm error:', err);
    }
  }

  private async sendTokenToBackend(token: string): Promise<void> {
    if (!token) return;

    try {
      await this.http
        .post(`${this.apiBase}/push/register`, {
          token,
          platform: this.platform.is('ios') ? 'ios' : 'android',
          deviceId: null
        })
        .toPromise();
      console.log('[FcmPushService] Token registered on backend');
    } catch (err) {
      console.error('[FcmPushService] Failed to register token on backend:', err);
    }
  }

  private isCallNotification(data: any): boolean {
    return data?.type === 'incoming_call' ||
      data?.type === 'video-call' ||
      data?.category === 'call' ||
      data?.event === 'call:invite';
  }
}
