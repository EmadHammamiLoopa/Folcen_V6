import { Injectable } from '@angular/core';
import { AdMobFree, AdMobFreeInterstitialConfig, AdMobFreeBannerConfig } from '@ionic-native/admob-free/ngx';
import { Platform } from '@ionic/angular';

@Injectable({
  providedIn: 'root'
})
export class AdMobFeeService {

  interstitialConfig: AdMobFreeInterstitialConfig = {
    isTesting: true,
    autoShow: true,
    id: 'ca-app-pub-3940256099942544/1033173712'
  };

  bannerConfig: AdMobFreeBannerConfig = {
    id: 'ca-app-pub-3940256099942544/6300978111',
    isTesting: true,
    autoShow: true
  }

  constructor(private adMobFree: AdMobFree, public platform: Platform) {
    platform.ready().then(() => {
      if (this.platform.is('cordova')) {
        this.adMobFree.interstitial.config(this.interstitialConfig);
        this.adMobFree.banner.config(this.bannerConfig);
      } else {
        console.warn('Cordova is not available. AdMob will not be configured.');
      }
    });
  }

  showInterstitialAd() {
    if (this.platform.is('cordova')) {
      this.adMobFree.interstitial.prepare();

      this.adMobFree.on(this.adMobFree.events.INTERSTITIAL_LOAD).subscribe(() => {
        console.log('Interstitial ad loaded');
        this.adMobFree.interstitial.show().then(() => {
          console.log('Interstitial ad shown successfully');
        }).catch((errorShow) => {
          console.error('Failed to show interstitial ad', errorShow);
        });
      });
      this.adMobFree.on(this.adMobFree.events.INTERSTITIAL_LOAD_FAIL).subscribe((reason) => {
        console.error('Failed to load interstitial ad', reason);
      });
    } else {
      console.warn('Cordova is not available. Interstitial ad cannot be shown.');
    }
  }

  showBannerAd() {
    if (this.platform.is('cordova')) {
      this.adMobFree.banner.prepare();
      this.adMobFree.on(this.adMobFree.events.BANNER_LOAD).subscribe(() => {
        console.log('Banner ad loaded');
        this.adMobFree.banner.show().then(() => {
          console.log('Banner ad shown successfully');
        }).catch((errorShow) => {
          console.error('Failed to show banner ad', errorShow);
        });
      });
      this.adMobFree.on(this.adMobFree.events.BANNER_LOAD_FAIL).subscribe((reason) => {
        console.error('Failed to load banner ad', reason);
      });
    } else {
      console.warn('Cordova is not available. Banner ad cannot be shown.');
    }
  }
}
