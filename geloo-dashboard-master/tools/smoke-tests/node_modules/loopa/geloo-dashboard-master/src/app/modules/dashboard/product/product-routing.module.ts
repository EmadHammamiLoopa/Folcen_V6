import { SuperAdminGuard } from './../../../guards/super-admin.guard';
import { DisplayProductComponent } from './display-product/display-product.component';
import { ProductFormComponent } from './product-form/product-form.component';
import { ListComponent } from './list/list.component';
import { ProductComponent } from './product.component';
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    component: ProductComponent,
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
        component: ProductFormComponent,
        canActivate: [SuperAdminGuard]
      },
      {
        path: 'display/:id',
        component: DisplayProductComponent
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ProductRoutingModule { }
