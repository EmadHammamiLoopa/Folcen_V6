import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PostRoutingModule } from './post-routing.module';
import { DisplayPostComponent } from './display-post/display-post.component';
import { ListComponent } from './list/list.component';
import { PostComponent } from './post.component';
import { ShareModule } from '../../share/share.module';


@NgModule({
  declarations: [
    DisplayPostComponent,
    ListComponent,
    PostComponent
  ],
  imports: [
    CommonModule,
    PostRoutingModule,
    ShareModule
  ]
})
export class PostModule { }
