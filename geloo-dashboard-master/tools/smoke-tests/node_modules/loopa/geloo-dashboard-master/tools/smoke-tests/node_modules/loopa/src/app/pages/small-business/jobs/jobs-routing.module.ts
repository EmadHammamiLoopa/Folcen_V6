import { ListComponent } from './list/list.component';
import { JobComponent } from './job/job.component';
import { JobFormComponent } from './job-form/job-form.component';

import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { JobsPage } from './jobs.page';

const routes: Routes = [
  {
    path: '',
    component: JobsPage,
    children: [
      {
        path: '',
        redirectTo: 'list/posted',
        pathMatch: 'full'
      },
      {
        path: 'list/:type',
        component: ListComponent
      },
      {
        path: 'job/:id',
        component: JobComponent
      },
      {
        path: 'form',
        component: JobFormComponent
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class JobsPageRoutingModule {}
