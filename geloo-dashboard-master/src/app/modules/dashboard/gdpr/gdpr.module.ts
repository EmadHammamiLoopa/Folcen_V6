import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { GdprRoutingModule } from './gdpr-routing.module';
import { ShareModule } from '../../share/share.module';

import { GdprCentreComponent } from './gdpr-centre/gdpr-centre.component';
import { DsarComponent } from './dsar/dsar.component';
import { EraseUserComponent } from './erase-user/erase-user.component';
import { ConsentControlsComponent } from './consent-controls/consent-controls.component';
import { AuditLogComponent } from './audit-log/audit-log.component';
import { InterestsComponent } from './interests/interests.component';

@NgModule({
  declarations: [
    GdprCentreComponent,
    DsarComponent,
    EraseUserComponent,
    ConsentControlsComponent,
    AuditLogComponent,
    InterestsComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ShareModule,
    GdprRoutingModule,
  ]
})
export class GdprModule {}
