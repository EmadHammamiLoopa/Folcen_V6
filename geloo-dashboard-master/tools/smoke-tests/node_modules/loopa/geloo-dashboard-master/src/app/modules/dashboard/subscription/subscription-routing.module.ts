import { SubscriptionFormComponent } from './subscription-form/subscription-form.component';
import { ListComponent } from './list/list.component';
import { SubscriptionComponent } from './subscription.component';
import { SubscriptionDisplayComponent } from './display-subscription/Subscription-DisplayComponent';  // <-- Import Display Component
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

// Optional: You can create and use a resolver to fetch subscription data before the display component is loaded

const routes: Routes = [
  {
    path: '',
    component: SubscriptionComponent,
    children: [
      {
        path: '',
        redirectTo: 'list',
        pathMatch: 'full'
      },
      {
        path: 'list',
        component: ListComponent
      },
      {
        path: 'form/:type',
        component: SubscriptionFormComponent
      },
      {
        path: 'display/:subscriptionId', // Updated to include :subscriptionId as a route parameter
        component: SubscriptionDisplayComponent,
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SubscriptionRoutingModule { }
