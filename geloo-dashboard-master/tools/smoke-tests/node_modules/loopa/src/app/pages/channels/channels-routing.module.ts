import { ChannelComponent } from './channel/channel.component';
import { ChannelFormComponent } from './channel-form/channel-form.component';
import { ListComponent } from './list/list.component';
import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ChannelsPage } from './channels.page';
import { CommentsComponent } from './channel/comments/comments.component';

const routes: Routes = [
  {
    path: '',
    component: ChannelsPage,
    children: [
      {
        path: '',
        redirectTo: 'list/followed',
        pathMatch: 'full'
      },
      {
        path: 'list/:type',
        component: ListComponent
      },
      {
        path: 'form',
        component: ChannelFormComponent
      },
      {
        path: 'channel',
        component: ChannelComponent
      },
      {
        path: 'post/:id',
        component: CommentsComponent
      }
    ]
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ChannelsPageRoutingModule {}
