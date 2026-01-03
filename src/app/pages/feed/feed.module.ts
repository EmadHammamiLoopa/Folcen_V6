import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { FeedPageRoutingModule } from './feed-routing.module';
import { FeedPage } from './feed.page';
import { PostModule } from '../channels/channel/post/post.module';
import { SharingModule } from '../sharing/sharing.module';
import { SharingPipeModule } from '../../pipes/sharing/sharing-pipe.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    FeedPageRoutingModule,
    PostModule,
    SharingModule,
    SharingPipeModule
  ],
  declarations: [FeedPage]
})
export class FeedPageModule {}
