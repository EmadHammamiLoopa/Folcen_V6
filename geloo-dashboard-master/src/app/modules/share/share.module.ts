import { DisplayComponent } from './../display/display.component';
import { NotificationService } from './../../services/notification.service';
import { ToastrModule, ToastrService } from 'ngx-toastr';
import { ResumeTextPipe } from './../../pipes/resume-text.pipe';
import { AlertComponent } from './../alert/alert.component';
import { SafeUrlPipe } from './../../pipes/safe-url.pipe';
import { RouterModule } from '@angular/router';
import { FormComponent } from '../form/form.component';
import { TableComponent } from '../table/table.component';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';


@NgModule({
  declarations: [
    TableComponent,
    FormComponent,
    SafeUrlPipe,
    AlertComponent,
    ResumeTextPipe,
    DisplayComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule
  ],
  providers: [
    ToastrService,
  ],
  exports: [
    TableComponent,
    FormComponent,
    SafeUrlPipe,
    AlertComponent,
    DisplayComponent,
    ResumeTextPipe,
    FormsModule
  ]
})
export class ShareModule { }
