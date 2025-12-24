import { SharingPipeModule } from './../../pipes/sharing/sharing-pipe.module';
import { FriendsHeaderComponent } from './friends-header/friends-header.component';
import { SharingModule } from './../sharing/sharing.module';
import { RequestsComponent } from './requests/requests.component';
import { ListComponent } from './list/list.component';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { FriendsPageRoutingModule } from './friends-routing.module';

import { FriendsPage } from './friends.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    FriendsPageRoutingModule,
    SharingModule,
    SharingPipeModule
  ],
  declarations: [
    FriendsPage,
    ListComponent,
    RequestsComponent,
    FriendsHeaderComponent
  ]
})
export class FriendsPageModule {}
