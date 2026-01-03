import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { SettingsPageRoutingModule } from './settings-routing.module';

import { SettingsPage } from './settings.page';
import { SharingModule } from '../sharing/sharing.module';
import { BlockedUsersModalComponent } from './blocked-users-modal/blocked-users-modal.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SettingsPageRoutingModule,
    SharingModule
  ],
  declarations: [
    SettingsPage,
    BlockedUsersModalComponent
  ]
})
export class SettingsPageModule {}
