import { FilePath } from '@ionic-native/file-path/ngx';
import { UploadFileService } from './../../services/upload-file.service';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { SharingModule } from './../sharing/sharing.module';
import { SharedComponentsModule } from '../../components/shared.module';
import { Camera } from '@ionic-native/camera/ngx';
import { DisplayComponent } from './display/display.component';
import { FormComponent } from './form/form.component';
import { FollowListModalComponent } from './follow-list-modal/follow-list-modal.component';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { File } from '@ionic-native/file/ngx'

import { IonicModule } from '@ionic/angular';

import { ProfilePageRoutingModule } from './profile-routing.module';

import { ProfilePage } from './profile.page';
import { SharingPipeModule } from 'src/app/pipes/sharing/sharing-pipe.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    SharedComponentsModule,
    SharingModule,
    SharingPipeModule,
    ProfilePageRoutingModule
  ],
  declarations: [
    ProfilePage,
    FormComponent,
    DisplayComponent,
    FollowListModalComponent
  ],
  entryComponents: [
    FollowListModalComponent
  ],
  providers: [
    Camera,
    NativeStorage,
    UploadFileService,
    FilePath,
    File,
    FormBuilder
  ]
})
export class ProfilePageModule {}
