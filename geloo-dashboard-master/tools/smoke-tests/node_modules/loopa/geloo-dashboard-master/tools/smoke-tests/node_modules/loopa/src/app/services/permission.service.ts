import { Injectable } from '@angular/core';
import { AndroidPermissions } from '@ionic-native/android-permissions/ngx';
import { OpenNativeSettings } from '@ionic-native/open-native-settings/ngx';
import { AlertController, Platform } from '@ionic/angular';

@Injectable({
  providedIn: 'root'
})
export class PermissionService {

  constructor(
    private alertCtrl: AlertController,
    private openNativeSettings: OpenNativeSettings,
    private androidPermission: AndroidPermissions,
    private platform: Platform
  ) {}

  async requestPermission(permission: string) {
    if (this.platform.is('cordova')) {
      return new Promise((resolve, reject) => {
        this.androidPermission.requestPermission(permission)
          .then(
            async (resp) => {
              if (resp.hasPermission) resolve(true);
              else {
                reject(await this.showPermissionAlert());
              }
            },
            async () => {
              reject(await this.showPermissionAlert());
            }
          );
      });
    } else {
      return Promise.resolve(true);  // Always resolve true in browser
    }
  }

  async showPermissionAlert() {
    const alert = await this.alertCtrl.create({
      header: 'Permission',
      message: 'Loopa doesn\'t have the permission to perform this action, please give us the permission from the application settings',
      buttons: [
        {
          text: 'CANCEL',
          role: 'cancel'
        },
        {
          text: 'Settings',
          handler: () => {
            if (this.platform.is('cordova')) {
              this.openNativeSettings.open('application_details');
            } else {
              console.log('Open settings');
            }
          }
        }
      ]
    });
    await alert.present();
    const dismiss = await alert.onDidDismiss();
    return dismiss.role == 'cancel';
  }

  getPermission(permission: string) {
    if (this.platform.is('cordova')) {
      return new Promise((resolve, reject) => {
        this.androidPermission.checkPermission(permission)
          .then(
            result => {
              if (result.hasPermission) {
                resolve(null);
              } else {
                this.requestPermission(permission)
                  .then(resp => {
                    if (resp) resolve(true);
                  }, (err) => reject(err));
              }
            },
            () => {
              this.requestPermission(permission)
                .then(resp => {
                  if (resp) resolve(true);
                }, (err) => reject(err));
            }
          );
      });
    } else {
      return Promise.resolve(true);  // Always resolve true in browser
    }
  }

}
