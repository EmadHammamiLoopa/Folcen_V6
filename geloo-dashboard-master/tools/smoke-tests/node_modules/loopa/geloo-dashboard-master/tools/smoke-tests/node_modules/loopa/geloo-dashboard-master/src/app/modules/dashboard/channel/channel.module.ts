import { ShareModule } from './../../share/share.module';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ChannelRoutingModule } from './channel-routing.module';
import { ChannelComponent } from './channel.component';
import { ListComponent } from './list/list.component';
import { ChannelFormComponent } from './channel-form/channel-form.component';
import { DisplayChannelComponent } from './display-channel/display-channel.component';


@NgModule({
  declarations: [
    ChannelComponent,
    ListComponent,
    ChannelFormComponent,
    DisplayChannelComponent
  ],
  imports: [
    CommonModule,
    ChannelRoutingModule,
    ShareModule
  ]
})
export class ChannelModule { }
