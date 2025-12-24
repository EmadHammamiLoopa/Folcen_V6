import { ProductsComponent } from './products/products.component';
import { ProductFormComponent } from './product-form/product-form.component';
import { ProductComponent } from './product/product.component';
import { SelectComponent } from './select/select.component';
import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { BuyAndSellPage } from './buy-and-sell.page';
import { ProductListComponent } from './products/product-list.component';

const routes: Routes = [
  {
    path: '',
    component: BuyAndSellPage,
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
        path: 'products/:type',
        component: ProductsComponent
      },
      {
        path: 'product/form',
        component: ProductFormComponent
      },
      {
        path: 'products/:type/list',
        component: ProductListComponent // Add the new route
      },
      {
        path: 'product/:id',
        component: ProductComponent
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class BuyAndSellPageRoutingModule {}
