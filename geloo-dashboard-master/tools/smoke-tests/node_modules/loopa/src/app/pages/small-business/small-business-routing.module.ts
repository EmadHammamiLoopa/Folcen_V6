import { SelectComponent } from './select/select.component';
import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { SmallBusinessPage } from './small-business.page';

const routes: Routes = [
  {
    path: '',
    component: SmallBusinessPage,
    children: [
      {
        path: '',
        redirectTo: 'select',
        pathMatch: 'full'
      },
      {
        path: 'select',
        component: SelectComponent
      },
      {
        path: 'services',
        loadChildren: () => import('./services/services.module').then( m => m.ServicesPageModule)
      },
      {
        path: 'jobs',
        loadChildren: () => import('./jobs/jobs.module').then( m => m.JobsPageModule)
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SmallBusinessPageRoutingModule {}
