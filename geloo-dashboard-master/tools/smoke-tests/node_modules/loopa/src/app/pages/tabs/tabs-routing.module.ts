import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AuthGuard } from 'src/app/guards/auth.guard';

import { TabsPage } from './tabs.page';

const routes: Routes = [
  {
    path: '',
    component: TabsPage,
    children: [
      {
        path: '',
        redirectTo: 'buy-and-sell',
        pathMatch: 'full'
      },
      {
        path: 'profile',
        loadChildren: () => import('./../profile/profile.module').then( m => m.ProfilePageModule),
        canActivate: [AuthGuard]

      },
      {
        path: 'friends',
        loadChildren: () => import('./../friends/friends.module').then( m => m.FriendsPageModule),
      },
      {
        path: 'messages',
        loadChildren: () => import('./../messages/messages.module').then( m => m.MessagesPageModule),
      },
      {
        path: 'channels',
        loadChildren: () => import('./../channels/channels.module').then( m => m.ChannelsPageModule),
      },
      {
        path: 'new-friends',
        loadChildren: () => import('./../new-friends/new-friends.module').then( m => m.NewFriendsPageModule),
      },
      {
        path: 'small-business',
        loadChildren: () => import('./../small-business/small-business.module').then( m => m.SmallBusinessPageModule),
      },
      {
        path: 'buy-and-sell',
        loadChildren: () => import('./../buy-and-sell/buy-and-sell.module').then( m => m.BuyAndSellPageModule),
        canActivate: [AuthGuard]
      },
      {
        path: 'profile/settings',
        loadChildren: () => import('./../settings/settings.module').then( m => m.SettingsPageModule),
      },
      {
        path: 'subscription',
        loadChildren: () => import('./../subscription/subscription.module').then( m => m.SubscriptionPageModule)
      },
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TabsPageRoutingModule {}
