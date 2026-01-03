import { DropDownComponent } from './../drop-down/drop-down.component';
import { ListSearchComponent } from './../list-search/list-search.component';
import { LoaderComponent } from './../loader/loader.component';
import { IonicModule } from '@ionic/angular';
import { HeaderComponent } from './../header/header.component';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImgLoaderComponent } from '../img-loader/img-loader.component';
import { RouterModule } from '@angular/router';
import { SharedComponentsModule } from 'src/app/components/shared.module';

@NgModule({
  declarations: [
    HeaderComponent,
    LoaderComponent,
    ListSearchComponent,
    ImgLoaderComponent,
    DropDownComponent
  ],
  imports: [
    CommonModule,
    IonicModule,
    RouterModule,
    SharedComponentsModule
  ],
  exports: [
    HeaderComponent,
    LoaderComponent,
    ImgLoaderComponent,
    ListSearchComponent,
    SharedComponentsModule
  ],
})
export class SharingModule { }
