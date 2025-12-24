import { SharingModule } from './../sharing/sharing.module';
import { SelectComponent } from './select/select.component';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { SmallBusinessPageRoutingModule } from './small-business-routing.module';

import { SmallBusinessPage } from './small-business.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SmallBusinessPageRoutingModule,
    SharingModule
  ],
  declarations: [
    SmallBusinessPage,
    SelectComponent
  ]
})
export class SmallBusinessPageModule {}
