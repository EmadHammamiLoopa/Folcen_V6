import { ServiceFormComponent } from './service-form/service-form.component';
import { ServiceComponent } from './service/service.component';
import { ListComponent } from './list/list.component';
import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ServicesPage } from './services.page';

const routes: Routes = [
  {
    path: '',
    component: ServicesPage,
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
        path: 'service/:id',
        component: ServiceComponent
      },
      {
        path: 'form',
        component: ServiceFormComponent
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ServicesPageRoutingModule {}
