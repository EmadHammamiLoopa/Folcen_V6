import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { GdprCentreComponent } from './gdpr-centre/gdpr-centre.component';
import { DsarComponent } from './dsar/dsar.component';
import { EraseUserComponent } from './erase-user/erase-user.component';
import { ConsentControlsComponent } from './consent-controls/consent-controls.component';
import { AuditLogComponent } from './audit-log/audit-log.component';
import { InterestsComponent } from './interests/interests.component';

const routes: Routes = [
  {
    path: '',
    component: GdprCentreComponent,
    children: [
      { path: '', redirectTo: 'dsar', pathMatch: 'full' },
      { path: 'dsar', component: DsarComponent },
      { path: 'erase', component: EraseUserComponent },
      { path: 'consent', component: ConsentControlsComponent },
      { path: 'audit-log', component: AuditLogComponent },
      { path: 'interests', component: InterestsComponent },
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class GdprRoutingModule {}
