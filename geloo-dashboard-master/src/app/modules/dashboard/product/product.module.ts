import { ShareModule } from './../../share/share.module';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ProductRoutingModule } from './product-routing.module';
import { ProductComponent } from './product.component';
import { ListComponent } from './list/list.component';
import { ProductFormComponent } from './product-form/product-form.component';
import { DisplayProductComponent } from './display-product/display-product.component';


@NgModule({
  declarations: [
    ProductComponent,
    ListComponent,
    ProductFormComponent,
    DisplayProductComponent
  ],
  imports: [
    CommonModule,
    ProductRoutingModule,
    ShareModule
  ]
})
export class ProductModule { }
