import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'src/app/models/Subscription';
import { SubscriptionService } from 'src/app/services/subscription.service';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { User } from './../../models/User';
import { AlertController } from '@ionic/angular';
import { Router } from '@angular/router';
import { UserService } from 'src/app/services/user.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-subscription',
  templateUrl: './subscription.page.html',
  styleUrls: ['./subscription.page.scss'],
})
export class SubscriptionPage implements OnInit, OnDestroy {

  subscription: Subscription;
  lastDate: Date;
  loading: boolean;
  prices: {
    price: string,
    duration: string
  }[] = [];
  selectedPrice = 0;
  user: User;
  private destroy$ = new Subject<void>();

  constructor(private subscriptionService: SubscriptionService, private nativeStorage: NativeStorage, private alertCtrl: AlertController,
              private router: Router, private userService: UserService) { }

  ngOnInit() {
    this.prices = [];
    this.userService.currentUser.pipe(takeUntil(this.destroy$)).subscribe(user => {
      if (user) {
        this.user = user;
        console.log('User updated in SubscriptionPage:', this.user);
        this.getSubscriptionPrices();
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ionViewWillEnter(){
    this.prices = []
  }

  navigateToPayment(){
    this.router.navigate(['/tabs/subscription/pay'], {
      queryParams: {
        subscription_id: this.subscription.id,
        price: this.prices[this.selectedPrice].price,
        duration: this.prices[this.selectedPrice].duration
      }
    })
  }

  pay(){
    if(this.user.subscription){
      this.alreadySubscribedAlert();
    }
    else this.navigateToPayment();
  }

  async alreadySubscribedAlert(){
    const alert = await this.alertCtrl.create({
      header: "Already Subscribed",
      message: "Your current subscription has not expired yet, if you continue, the current subscription will be canceled and replaced by the new subscription",
      buttons: [
        {
          text: 'CANCEL',
          role: 'cancel'
        },
        {
          text: 'CONTINUE',
          cssClass: 'text-danger',
          handler: () => this.navigateToPayment()
        }
      ]
    })

    await alert.present();
  }

  getSubscriptionPrices(){
    this.loading = true;
    this.subscriptionService.getSubscriptionPrices().then((resp: any) => {
      console.log("prices:..................",resp);
      this.loading = false;
      this.subscription = new Subscription(resp.data);
      const currency = this.subscription.currency
      if(this.subscription.yearPrice) this.prices.unshift({duration: 'year', price: this.subscription.yearPrice + ' ' + currency})
      if(this.subscription.monthPrice) this.prices.unshift({duration: 'month', price: this.subscription.monthPrice + ' ' + currency})
      if(this.subscription.weekPrice) this.prices.unshift({duration: 'week', price: this.subscription.weekPrice + ' ' + currency})
      if(this.subscription.dayPrice) this.prices.unshift({duration: 'day', price: this.subscription.dayPrice + ' ' + currency})
    }, err => {
      this.loading = false;
      console.log(err);
    })
  }

  savedPrice(ind: number){
    const previousPrice = this.prices[ind - 1];
    const currentPrice = this.prices[ind];
    const expectedPrice = this.howManyIn(previousPrice.duration, currentPrice.duration) * parseFloat(previousPrice.price);
    const diff = expectedPrice - parseFloat(currentPrice.price);
    return Math.round( diff * 100 / expectedPrice);
  }

  howManyIn(duration1, duration2): number{
    if(duration2 == 'year'){
      return duration1 == 'month' ? 12 : (duration1 == 'week' ? 48 : 365)
    }
    if(duration2 ==  'month'){
      return duration1 == 'week' ? 4 : 30
    }
    return 7;
  }

  userExpireDate(){
    let diffInMilliSeconds = Math.abs(new Date(this.user.subscription.expireDate).getTime() - new Date().getTime()) / 1000;

    // calculate days
    const days = Math.floor(diffInMilliSeconds / 86400);
    diffInMilliSeconds -= days * 86400;

    // calculate hours
    const hours = Math.floor(diffInMilliSeconds / 3600) % 24;
    diffInMilliSeconds -= hours * 3600;

    // calculate minutes
    const minutes = Math.floor(diffInMilliSeconds / 60) % 60;
    diffInMilliSeconds -= minutes * 60;

    let difference = '';
    if (days > 0) {
      difference += `${days}d : `;
    }

    difference += `${hours}h : ${minutes}m`;

    return difference;
  }
}
