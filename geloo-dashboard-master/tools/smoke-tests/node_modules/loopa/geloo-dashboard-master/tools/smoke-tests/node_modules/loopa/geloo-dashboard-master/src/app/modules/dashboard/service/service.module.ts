import { ServiceFormComponent } from './service-form/service-form.component';
import { ShareModule } from './../../share/share.module';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ServiceRoutingModule } from './service-routing.module';
import { ListComponent } from './list/list.component';
import { ServiceComponent } from './service.component';
import { DisplayServiceComponent } from './display-service/display-service.component';


@NgModule({
  declarations: [
    ListComponent,
    ServiceComponent,
    ServiceFormComponent,
    DisplayServiceComponent
  ],
  imports: [
    CommonModule,
    ServiceRoutingModule,
    ShareModule
  ]
})
export class ServiceModule { }
