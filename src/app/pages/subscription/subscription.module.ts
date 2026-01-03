import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { SubscriptionPageRoutingModule } from './subscription-routing.module';

import { SubscriptionPage } from './subscription.page';
import { SharingModule } from '../sharing/sharing.module';
import { PaymentComponent } from './payment/payment.component';
import { NgxStripeModule } from 'ngx-stripe';
import { SharedComponentsModule } from '../../components/shared.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SubscriptionPageRoutingModule,
    SharingModule,
    SharedComponentsModule,
    ReactiveFormsModule,
    NgxStripeModule
  ],
  declarations: [
    SubscriptionPage,
    PaymentComponent
  ]
})
export class SubscriptionPageModule {}
