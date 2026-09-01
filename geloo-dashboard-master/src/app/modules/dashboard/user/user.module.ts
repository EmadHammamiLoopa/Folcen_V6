import { NotificationService } from './../../../services/notification.service';
import { ToastrModule, ToastrService } from 'ngx-toastr';
import { ShareModule } from './../../share/share.module';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { UserRoutingModule } from './user-routing.module';
import { UserComponent } from './user.component';
import { ListComponent } from './list/list.component';
import { UserFormComponent } from './user-form/user-form.component';
import { DisplayUserComponent } from './display-user/display-user.component';
import { AnalyticsComponent } from './analytics/analytics.component';
import { NgChartsModule } from 'ng2-charts';


@NgModule({
  declarations: [
    UserComponent,
    ListComponent,
    UserFormComponent,
    DisplayUserComponent,
    AnalyticsComponent
  ],
  imports: [
    ShareModule,
    CommonModule,
    UserRoutingModule,
    NgChartsModule
  ]
})
export class UserModule { }
