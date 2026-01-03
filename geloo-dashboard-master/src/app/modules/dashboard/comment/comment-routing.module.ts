import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CommentComponent } from './comment.component';
import { DisplayCommentComponent } from './display-comment/display-comment.component';
import { ListComponent } from './list/list.component';
import { CommentFormComponent } from './comment-form/comment-form.component';

const routes: Routes = [
  {
    path: '',
    component: CommentComponent,
    children: [
      {
        path: '',
        redirectTo: 'list',
        pathMatch: 'full'
      },
      {
        path: 'list',
        component: ListComponent
      },
      {
        path: 'display/:id',
        component: DisplayCommentComponent
      },
      {
        path: 'form/:type',
        component: CommentFormComponent
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CommentRoutingModule { }
