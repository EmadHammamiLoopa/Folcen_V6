import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ActivityPage } from './activity.page';
import { RouterModule } from '@angular/router';
import { SharingPipeModule } from 'src/app/pipes/sharing/sharing-pipe.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharingPipeModule,
    RouterModule.forChild([{ path: '', component: ActivityPage }])
  ],
  declarations: [ActivityPage]
})
export class ActivityPageModule {}
