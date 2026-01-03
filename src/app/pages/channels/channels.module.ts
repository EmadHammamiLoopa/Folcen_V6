import { PostModule } from './channel/post/post.module';
import { SharingPipeModule } from './../../pipes/sharing/sharing-pipe.module';
import { PostFormComponent } from './channel/post-form/post-form.component';
import { ChannelComponent } from './channel/channel.component';
import { WebView } from '@ionic-native/ionic-webview/ngx';
import { Camera } from '@ionic-native/camera/ngx';
import { FilePath } from '@ionic-native/file-path/ngx';
import { File } from '@ionic-native/file/ngx';
import { UploadFileService } from './../../services/upload-file.service';
import { ChannelFormComponent } from './channel-form/channel-form.component';
import { ChannelsHeaderComponent } from './channels-header/channels-header.component';
import { ListComponent } from './list/list.component';
import { SharingModule } from './../sharing/sharing.module';
import { SharedComponentsModule } from '../../components/shared.module';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ChannelsPageRoutingModule } from './channels-routing.module';
import { ChannelsPage } from './channels.page';
import { TermsModalComponent } from './channel-form/terms-modal.component'; // Adjust the path as needed
import { ChannelPopoverComponent } from './list/ChannelPopoverComponent';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    ChannelsPageRoutingModule,
    SharingModule,
    SharingPipeModule,
    PostModule,
    SharedComponentsModule
  ],
  declarations: [
    ChannelsPage,
    ListComponent,
    ChannelsHeaderComponent,
    ChannelFormComponent,
    ChannelComponent,
    PostFormComponent,
    TermsModalComponent,
    ChannelPopoverComponent
  ],
  providers: [
    UploadFileService,
    File,
    FilePath,
    Camera,
    WebView
  ]
})
export class ChannelsPageModule {}
