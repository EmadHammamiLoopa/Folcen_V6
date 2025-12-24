import { SuperAdminGuard } from './../../../guards/super-admin.guard';
import { DisplayChannelComponent } from './display-channel/display-channel.component';
import { ChannelFormComponent } from './channel-form/channel-form.component';
import { ListComponent } from './list/list.component';
import { ChannelComponent } from './channel.component';
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    component: ChannelComponent,
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
        path: 'form/:type',
        component: ChannelFormComponent,
        canActivate: [SuperAdminGuard]
      },
      {
        path: 'display/:id',
        component: DisplayChannelComponent
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ChannelRoutingModule { }
