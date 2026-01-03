import { ShareModule } from './../../share/share.module';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SubscriptionRoutingModule } from './subscription-routing.module';
import { SubscriptionComponent } from './subscription.component';
import { ListComponent } from './list/list.component';
import { SubscriptionFormComponent } from './subscription-form/subscription-form.component';
import { SubscriptionDisplayComponent } from './display-subscription/Subscription-DisplayComponent';
import { PlanRuleListComponent } from './plan-rule-list/plan-rule-list.component';
import { PlanRuleFormComponent } from './plan-rule-form/plan-rule-form.component';


@NgModule({
  declarations: [
    SubscriptionComponent,
    ListComponent,
    SubscriptionFormComponent,
    SubscriptionDisplayComponent,
    PlanRuleListComponent,
    PlanRuleFormComponent
  ],
  imports: [
    CommonModule,
    SubscriptionRoutingModule,
    ShareModule
  ]
})
export class SubscriptionModule { }
