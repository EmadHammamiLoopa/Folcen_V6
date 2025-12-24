import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { CommentRoutingModule } from './comment-routing.module';
import { CommentComponent } from './comment.component';
import { CommentFormComponent } from './comment-form/comment-form.component';
import { DisplayCommentComponent } from './display-comment/display-comment.component';
import { ListComponent } from './list/list.component';
import { ShareModule } from '../../share/share.module';


@NgModule({
  declarations: [
    CommentComponent,
    CommentFormComponent,
    DisplayCommentComponent,
    ListComponent
  ],
  imports: [
    CommonModule,
    CommentRoutingModule,
    ShareModule
  ]
})
export class CommentModule { }
