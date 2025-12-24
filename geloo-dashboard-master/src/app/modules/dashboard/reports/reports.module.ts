import { ShareModule } from './../../share/share.module';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ReportsRoutingModule } from './reports-routing.module';
import { ReportsComponent } from './reports.component';
import { ListComponent } from './list/list.component';
import { DisplayReportComponent } from './display-report/display-report.component';


@NgModule({
  declarations: [
    ReportsComponent,
    ListComponent,
    DisplayReportComponent
  ],
  imports: [
    CommonModule,
    ReportsRoutingModule,
    ShareModule
  ]
})
export class ReportsModule { }
