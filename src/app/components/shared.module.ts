import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SandglassLoaderComponent } from './sandglass-loader/sandglass-loader.component';
import { PhotoViewerComponent } from './photo-viewer/photo-viewer.component';
import { ReportModalComponent } from './report-modal/report-modal.component';
import { AvatarComponent } from './avatar/avatar.component';
import { AvatarCustomizeModalComponent } from './avatar-customize-modal/avatar-customize-modal.component';
import { AnnouncementModalComponent } from './announcement-modal/announcement-modal.component';
import { IonicModule } from '@ionic/angular';

@NgModule({
  declarations: [
    SandglassLoaderComponent, 
    PhotoViewerComponent, 
    ReportModalComponent, 
    AvatarComponent,
    AvatarCustomizeModalComponent,
    AnnouncementModalComponent
  ],
  imports: [CommonModule, IonicModule, FormsModule],
  entryComponents: [
    PhotoViewerComponent,
    ReportModalComponent,
    AvatarCustomizeModalComponent,
    AnnouncementModalComponent
  ],
  exports: [
    SandglassLoaderComponent, 
    PhotoViewerComponent, 
    ReportModalComponent, 
    AvatarComponent,
    AvatarCustomizeModalComponent,
    AnnouncementModalComponent
  ]
})
export class SharedComponentsModule {}
