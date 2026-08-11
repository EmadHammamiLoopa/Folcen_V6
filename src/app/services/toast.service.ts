import { Injectable } from '@angular/core';
import { ToastController, Platform } from '@ionic/angular';
import { Toast } from '@ionic-native/toast/ngx';

@Injectable({
  providedIn: 'root'
})
export class ToastService {

  constructor(private toastCtrl: ToastController, private toast: Toast, private platform: Platform) { }

  /** Safely extract a human-readable string from any error value. */
  private toErrorString(err: any): string {
    if (typeof err === 'string') return err;
    if (err && typeof err === 'object') {
      const errBody = err.error;
      // Backend sometimes returns plain-text responses (e.g. 'No avatar file uploaded')
      if (typeof errBody === 'string' && errBody.length < 300) return errBody;
      return errBody?.message
        || (typeof errBody?.errors === 'string' ? errBody.errors : null)
        || errBody?.errors?.text?.[0]
        || err.message
        || 'An unexpected error occurred.';
    }
    return 'An unexpected error occurred.';
  }

  async presentErrorToastr(err: any, position: any = 'top') {
    const msg = this.toErrorString(err);
    try {
      const trace = {
        message: msg,
        raw: err,
        stack: err?.stack,
        at: new Date().toISOString()
      };
      (window as any).__lastErrorToast = trace;
      console.error('[toast:error]', trace);
    } catch (_) {}
    if (this.platform.is('cordova')) {
      this.toast.show(msg, '3000', position).subscribe(
        toast => { console.log(toast); },
        error => { console.error('Error showing native toast', error); }
      );
    } else {
      const toastr = await this.toastCtrl.create({
        message: '❌ ' + msg,
        position,
        color: 'danger',
        duration: 3000,
        buttons: [{ text: 'OK', role: 'cancel' }]
      });
      toastr.present();
    }
  }

  async presentToast(msg: string) {
    return this.presentStdToastr(msg);
  }

  async presentStdToastr(msg: any, position: any = 'top') {
    let displayMsg = msg;
    if (msg && typeof msg !== 'string') {
      displayMsg = msg.error?.message || msg.message || JSON.stringify(msg);
    }

    if (this.platform.is('cordova')) {
      this.toast.show(displayMsg, '2000', position).subscribe(
        toast => {
          console.log(toast);
        },
        error => {
          console.error('Error showing native toast', error);
        }
      );
    } else {
      const toastr = await this.toastCtrl.create({
        message: 'ℹ️ ' + displayMsg,
        position: position,
        duration: 2000,
        color: 'dark',
      });

      toastr.present();
    }
  }

  async presentSuccessToastr(success: any, position: any = 'top') {
    const msg = typeof success === 'string' ? success : (success?.message || String(success));
    if (this.platform.is('cordova')) {
      this.toast.show(msg, '2500', position).subscribe(
        toast => { console.log(toast); },
        error => { console.error('Error showing native toast', error); }
      );
    } else {
      const toastr = await this.toastCtrl.create({
        message: '✅ ' + msg,
        position: position,
        color: 'success',
        duration: 2500,
      });
      toastr.present();
    }
  }
}
