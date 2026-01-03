import { UserService } from './../../services/user.service';
import { HTTP } from '@ionic-native/http/ngx';import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { SlideComponent } from './slide/slide.component';
import { SharingModule } from './../sharing/sharing.module';
import { SharedComponentsModule } from '../../components/shared.module';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { NewFriendsPageRoutingModule } from './new-friends-routing.module';

import { NewFriendsPage } from './new-friends.page';
import { SearchOptionsComponent } from './search-options/search-options.component';
import { SharingPipeModule } from 'src/app/pipes/sharing/sharing-pipe.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    NewFriendsPageRoutingModule,
    SharingModule,
    SharingPipeModule,
    SharedComponentsModule
  ],
  declarations: [
    NewFriendsPage,
    SlideComponent,
    SearchOptionsComponent
  ],
  providers: [
    NativeStorage,
    HTTP
  ]
})
export class NewFriendsPageModule {}
