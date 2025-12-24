import { SuperAdminGuard } from './../../../guards/super-admin.guard';
import { DisplayServiceComponent } from './display-service/display-service.component';
import { ListComponent } from './list/list.component';
import { ServiceComponent } from './service.component';
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ServiceFormComponent } from './service-form/service-form.component';

const routes: Routes = [
  {
    path: '',
    component: ServiceComponent,
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
        component: ServiceFormComponent,
        canActivate: [SuperAdminGuard]
      },
      {
        path: 'display/:id',
        component: DisplayServiceComponent
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ServiceRoutingModule { }
