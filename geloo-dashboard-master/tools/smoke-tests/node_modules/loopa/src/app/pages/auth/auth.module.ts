import { HTTP } from '@ionic-native/http/ngx';import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { AuthService } from './../../services/auth.service';
import { SharingModule } from './../sharing/sharing.module';
import { HomeComponent } from './home/home.component';
import { SignupComponent } from './signup/signup.component';
import { SigninComponent } from './signin/signin.component';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AuthPageRoutingModule } from './auth-routing.module';

import { AuthPage } from './auth.page';
import { WelcomeAlertComponent } from './welcome-alert/welcome-alert.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    AuthPageRoutingModule,
    SharingModule,
  ],
  declarations: [
    AuthPage,
    SigninComponent,
    SignupComponent,
    HomeComponent,
    WelcomeAlertComponent
  ],
  providers: [
    AuthService,
    NativeStorage,
    HTTP
  ]
})
export class AuthPageModule {}
