import { ShareModule } from './../../share/share.module';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { JobRoutingModule } from './job-routing.module';
import { JobComponent } from './job.component';
import { ListComponent } from './list/list.component';
import { JobFormComponent } from './job-form/job-form.component';
import { DisplayJobComponent } from './display-job/display-job.component';


@NgModule({
  declarations: [
    JobComponent,
    ListComponent,
    JobFormComponent,
    DisplayJobComponent
  ],
  imports: [
    CommonModule,
    JobRoutingModule,
    ShareModule
  ]
})
export class JobModule { }
