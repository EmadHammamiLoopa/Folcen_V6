import { DropDownComponent } from './../drop-down/drop-down.component';
import { ListSearchComponent } from './../list-search/list-search.component';
import { LoaderComponent } from './../loader/loader.component';
import { IonicModule } from '@ionic/angular';
import { HeaderComponent } from './../header/header.component';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImgLoaderComponent } from '../img-loader/img-loader.component';
import { RouterModule } from '@angular/router';

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
    RouterModule
  ],
  exports: [
    HeaderComponent,
    LoaderComponent,
    ImgLoaderComponent,
    ListSearchComponent
  ],
})
export class SharingModule { }
