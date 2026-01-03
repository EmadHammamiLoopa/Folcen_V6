import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { PostComponent } from './post.component';
import { CommentsComponent } from '../comments/comments.component';
import { CommentComponent } from '../comment/comment.component';
import { SharingPipeModule } from '../../../../pipes/sharing/sharing-pipe.module';
import { SharingModule } from '../../../sharing/sharing.module';
import { SharedComponentsModule } from '../../../../components/shared.module';

@NgModule({
  declarations: [
    PostComponent,
    CommentsComponent,
    CommentComponent
  ],
  imports: [
    CommonModule,
    IonicModule,
    FormsModule,
    SharingPipeModule,
    SharingModule,
    SharedComponentsModule
  ],
  exports: [
    PostComponent,
    CommentsComponent,
    CommentComponent
  ]
})
export class PostModule { }
