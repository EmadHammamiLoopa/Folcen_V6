import { SuperAdminGuard } from './../../../guards/super-admin.guard';
import { DisplayUserComponent } from './display-user/display-user.component';
import { UserFormComponent } from './user-form/user-form.component';
import { ListComponent } from './list/list.component';
import { AnalyticsComponent } from './analytics/analytics.component';
import { UserComponent } from './user.component';
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    component: UserComponent,
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
        path: 'analytics',
        component: AnalyticsComponent
      },
      {
        path: 'form/:type',
        component: UserFormComponent,
        canActivate: [SuperAdminGuard]
      },
      {
        path: 'display/:id',
        component: DisplayUserComponent
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class UserRoutingModule { }
