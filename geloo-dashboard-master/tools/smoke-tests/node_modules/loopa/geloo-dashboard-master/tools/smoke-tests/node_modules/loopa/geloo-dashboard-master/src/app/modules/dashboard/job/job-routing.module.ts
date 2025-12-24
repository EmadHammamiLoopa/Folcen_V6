import { SuperAdminGuard } from './../../../guards/super-admin.guard';
import { DisplayJobComponent } from './display-job/display-job.component';
import { JobComponent } from './job.component';
import { JobFormComponent } from './job-form/job-form.component';
import { ListComponent } from './list/list.component';
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    component: JobComponent,
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
        component: JobFormComponent,
        canActivate: [SuperAdminGuard]
      },
      {
        path: 'display/:id',
        component: DisplayJobComponent
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class JobRoutingModule { }
