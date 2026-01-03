import { Injectable } from '@angular/core';
import { ToastController, Platform } from '@ionic/angular';
import { Toast } from '@ionic-native/toast/ngx';

@Injectable({
  providedIn: 'root'
})
export class ToastService {

  constructor(private toastCtrl: ToastController, private toast: Toast, private platform: Platform) { }

  async presentErrorToastr(err: string, position: any = 'top') {
    if (this.platform.is('cordova')) {
      this.toast.show(err, '3000', position).subscribe(
        toast => {
          console.log(toast);
        },
        error => {
          console.error('Error showing native toast', error);
        }
      );
    } else {
      const toastr = await this.toastCtrl.create({
        message: '❌ ' + err,
        position,
        color: 'danger',
        duration: 3000,
        buttons: [
          {
            text: 'OK',
            role: 'cancel'
          }
        ]
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

  async presentSuccessToastr(success: string, position: any = 'top') {
    if (this.platform.is('cordova')) {
      this.toast.show(success, '2500', position).subscribe(
        toast => {
          console.log(toast);
        },
        error => {
          console.error('Error showing native toast', error);
        }
      );
    } else {
      const toastr = await this.toastCtrl.create({
        message: '✅ ' + success,
        position: position,
        color: 'success',
        duration: 2500,
      });

      toastr.present();
    }
  }
}
